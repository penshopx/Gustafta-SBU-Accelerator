import { lazy, Suspense, useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { ErrorBoundary } from './error-boundary';

// Keep both the dialog library and curated support content out of the initial
// graph. Once mounted, keep the real component mounted so close/reopen retains
// the same bounded, in-memory history and identity-key remount still clears it.
const HelpDesk = lazy(() => import('./help-desk'));
const position = {
  right: 'max(16px, env(safe-area-inset-right))',
  bottom: 'max(16px, env(safe-area-inset-bottom))',
};
const buttonClass = 'fixed z-[45] inline-flex min-h-[48px] items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_12px_32px_hsl(var(--foreground)/0.22)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden';

function Launcher({ loading = false, activate }: { loading?: boolean; activate: () => void }) {
  useEffect(() => {
    if (!loading) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') activate();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [loading, activate]);
  return <button type="button" data-testid="help-desk-trigger"
    aria-label={loading ? 'Batalkan pemuatan Help Desk' : 'Buka Help Desk, pemandu aplikasi'}
    aria-haspopup="dialog" aria-busy={loading} autoFocus={loading}
    onClick={activate} className={buttonClass} style={position}>
    <LifeBuoy size={19} aria-hidden="true" />
    {loading ? <span role="status">Memuat bantuan… · Batal</span> : 'Bantuan'}
  </button>;
}

export default function HelpDeskEntry() {
  const [requested, setRequested] = useState(false);
  return <ErrorBoundary
    FallbackComponent={({ resetError }) => (
      <div role="alert" className="surface fixed z-[61] w-[calc(100vw-32px)] max-w-sm p-5 print:hidden" style={position}>
        <h2 className="font-bold">Bantuan belum dapat dimuat</h2>
        <p className="mt-2 text-sm text-muted-foreground">Periksa koneksi. Memuat ulang halaman dapat menghapus isian yang belum disimpan.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-outline" onClick={() => { setRequested(false); resetError(); }}>Tutup</button>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Muat ulang halaman</button>
        </div>
      </div>
    )}
  >
    <Suspense fallback={<Launcher loading activate={() => setRequested(false)} />}>
      {requested ? <HelpDesk initiallyOpen /> : <Launcher activate={() => setRequested(true)} />}
    </Suspense>
  </ErrorBoundary>;
}
