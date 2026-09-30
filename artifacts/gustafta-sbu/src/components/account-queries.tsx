import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const activeAccountKey = 'gustafta:active-account';

// Clerk can keep a tab's in-memory user while another tab changes the shared
// session cookie. Hide the old tree immediately, then reload Clerk from disk.
export function CrossTabAccountGate({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const check = (otherId: string | null) => {
      if (otherId === userId) return;
      flushSync(() => setBlocked(true));
      window.location.reload();
    };
    // BroadcastChannel also works when localStorage is unavailable.
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(activeAccountKey);
    const onMessage = (event: MessageEvent<string>) => {
      if (typeof event.data === 'string') check(event.data);
    };
    channel?.addEventListener('message', onMessage);
    const onStorage = (event: StorageEvent) => {
      if (event.key === activeAccountKey && event.newValue !== null) check(event.newValue);
    };
    const onFocus = () => {
      try {
        const current = localStorage.getItem(activeAccountKey);
        if (current !== null) check(current);
      } catch { /* Storage may be unavailable; server-owner checks still guard new renders. */ }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    try {
      localStorage.setItem(activeAccountKey, userId ?? '');
    } catch { /* Browser storage is optional. */ }
    channel?.postMessage(userId ?? '');
    return () => {
      channel?.removeEventListener('message', onMessage);
      channel?.close();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [userId]);

  return blocked ? null : children;
}

export function createAccountQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 25000 } },
  });
}

export function AccountQueries({ children }: { children: ReactNode }) {
  const [client] = useState(createAccountQueryClient);

  // A keyed instance is created for each signed-in identity (and for signed-out).
  // Cancel outstanding requests and remove private data when that instance leaves.
  useEffect(() => () => {
    client.clear();
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}