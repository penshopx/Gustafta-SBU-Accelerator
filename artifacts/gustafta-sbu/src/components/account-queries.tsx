import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const activeAccountKey = 'gustafta:active-account';
const FormOwnerContext = createContext<string | null>(null);

// Capture once, alongside the form's draft. Never obtain the owner from the
// latest cookie, a global getter, or a refreshed /me response at dispatch time.
export function useFormMutationOptions() {
  const owner = useContext(FormOwnerContext);
  const [options] = useState(() => ({
    request: { headers: { 'X-SBU-Form-Owner': owner ?? '' } },
  }));
  return options;
}

// Clerk can keep a tab's in-memory user while another tab changes the shared
// session cookie. Hide the old tree immediately, then reload Clerk from disk.
export function CrossTabAccountGate({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let reloading = false;
    const conceal = () => {
      // Conceal the actual DOM before the browser snapshots it for BFCache.
      // React state alone cannot guarantee the saved frame has been redacted.
      if (surface.current) surface.current.style.display = 'none';
      flushSync(() => setBlocked(true));
    };
    const reload = () => {
      conceal();
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const check = (otherId: string | null) => {
      if ((otherId || null) === userId) return;
      reload();
    };
    const onPageHide = () => conceal();
    const onPageShow = (event: PageTransitionEvent) => {
      // A frozen tab misses storage/channel messages. Never trust either its
      // cached /me response or mounted Clerk identity, even if storage agrees.
      // Reload gives Clerk and the server-owner gate fresh, empty query caches.
      if (event.persisted) reload();
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
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
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
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [userId]);

  return <div ref={surface} style={{ display: blocked ? 'none' : 'contents' }}>{blocked ? null : children}</div>;
}

export function createAccountQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 25000 } },
  });
}

export function AccountQueries({ children, userId = null }: { children: ReactNode; userId?: string | null }) {
  const [client] = useState(createAccountQueryClient);

  // A keyed instance is created for each signed-in identity (and for signed-out).
  // Cancel outstanding requests and remove private data when that instance leaves.
  useEffect(() => () => {
    client.clear();
  }, [client]);

  return <FormOwnerContext.Provider value={userId}><QueryClientProvider client={client}>{children}</QueryClientProvider></FormOwnerContext.Provider>;
}