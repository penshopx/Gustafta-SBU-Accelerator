import React, { useEffect, useState, type ReactNode } from 'react';
import { SessionVerificationError } from './session-verification-error';

export function SessionLoadingBoundary({ resolved, loading, children, reload, signOut }: {
  resolved: boolean;
  loading: ReactNode;
  children: ReactNode;
  reload: () => void;
  signOut: () => Promise<unknown>;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (resolved) return;
    const timer = window.setTimeout(() => setExpired(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [resolved]);
  if (resolved) return <>{children}</>;
  if (!expired) return <>{loading}</>;
  return <div className="mx-auto max-w-xl p-10"><SessionVerificationError
    error={{ code: 'session_loading_timeout' }}
    retry={async () => reload()}
    reload={reload}
    signOut={signOut}
  /></div>;
}
