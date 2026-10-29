import { lazy, Suspense, type ComponentType } from 'react';
import { ErrorBoundary } from './error-boundary';

/**
 * Delay module loading, not authorization. Keep this component inside the
 * existing account/owner gates; never capture identity in the module loader.
 */
export function lazyFeature<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
) {
  const Feature = lazy(load);

  return function LazyFeature(props: Props) {
    return (
      <ErrorBoundary
        FallbackComponent={() => (
          <div role="alert" className="surface p-6">
            <h2 className="font-bold">Fitur belum dapat dimuat</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Periksa koneksi, lalu muat ulang halaman. Isian yang belum disimpan dapat hilang.
              Tombol ini tidak menyimpan atau mengirim isian.
            </p>
            <button
              type="button"
              className="btn btn-outline mt-4"
              // Browsers cache failed dynamic imports; another React.lazy
              // instance cannot reliably retry the same module URL.
              onClick={() => window.location.reload()}
            >
              Coba muat fitur lagi
            </button>
          </div>
        )}
      >
        <Suspense fallback={<div role="status" aria-live="polite" className="p-6 text-sm text-muted-foreground">Memuat fitur…</div>}>
          <Feature {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  };
}
