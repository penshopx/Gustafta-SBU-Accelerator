import * as React from 'react';

export function KnowledgePdfCanvas({ url, initialPage, pageCount }: { url: string; initialPage: number; pageCount: number }) {
  const [page, setPage] = React.useState(initialPage);
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = React.useState(0);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    const controller = new AbortController();
    setState('loading');
    void (async () => {
      try {
        const { renderKnowledgePdf } = await import('@/lib/knowledge-pdf-renderer');
        if (controller.signal.aborted) return;
        await renderKnowledgePdf(url, page, element, controller.signal);
        if (!controller.signal.aborted) setState('ready');
      } catch {
        if (!controller.signal.aborted) setState('error');
      }
    })();
    return () => controller.abort();
  }, [url, page, retry]);
  return <div className="mt-3 rounded-lg border border-[#d8e4ec] bg-[#f3f7fa] p-3" data-testid="pdf-reader">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <button type="button" className="btn btn-outline px-3 py-2" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</button>
      <span className="font-semibold text-[#27425a]">Halaman PDF {page} dari {pageCount}</span>
      <button type="button" className="btn btn-outline px-3 py-2" disabled={page === pageCount} onClick={() => setPage(p => p + 1)}>Berikutnya</button>
    </div>
    {state === 'loading' && <p role="status" className="mt-3 text-sm text-[#58708a]">Merender halaman PDF…</p>}
    {state === 'error' && <div role="alert" className="mt-3 text-sm text-red-700">Pratinjau belum dapat ditampilkan. Coba lagi atau gunakan buka tab baru/unduh.
      <button type="button" onClick={() => setRetry(r => r + 1)} className="ml-2 underline">Ulangi pratinjau</button>
    </div>}
    <canvas ref={canvas} data-testid="knowledge-pdf-canvas" data-page={page} aria-label={`Pratinjau halaman PDF ${page}`}
      className={`mt-3 h-auto w-full bg-white ${state === 'ready' ? '' : 'hidden'}`} />
    {state === 'ready' && <p role="status" data-testid="pdf-rendered" className="mt-2 text-xs text-[#58708a]">Halaman {page} ditampilkan. Gunakan PDF asli untuk pencarian teks dan pemeriksaan rinci.</p>}
  </div>;
}
