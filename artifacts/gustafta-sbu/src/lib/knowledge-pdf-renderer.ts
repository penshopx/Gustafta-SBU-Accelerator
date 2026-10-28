import { getDocument, GlobalWorkerOptions, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Bundled worker, not a CDN. PDF actions/scripts are not executed.
GlobalWorkerOptions.workerSrc = workerUrl;
export async function renderKnowledgePdf(url: string, pageNumber: number, canvas: HTMLCanvasElement, signal: AbortSignal) {
  signal.throwIfAborted();
  const task = getDocument({ url, useSystemFonts: true });
  let render: RenderTask | undefined;
  const cancel = () => { render?.cancel(); void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const document = await task.promise;
    signal.throwIfAborted();
    const page = await document.getPage(pageNumber);
    const initial = page.getViewport({ scale: 1 });
    const width = Math.min(1200, Math.max(600, canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
    const viewport = page.getViewport({ scale: width / initial.width });
    if (viewport.height > 5000) throw new Error('page_too_large');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    render = page.render({ canvas, viewport });
    await render.promise;
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', cancel);
    await task.destroy();
  }
}
