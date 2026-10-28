import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Info, Play } from 'lucide-react';

// Load our own film document into the frame rather than navigating a nested
// preview iframe to another artifact. Playback starts only after user intent.
export const FILM_URL = '/gustafta-film/';

export function FilmEmbed() {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [html, setHtml] = useState<string>();
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!attempt) return;
    const controller = new AbortController();
    setStatus('loading'); setHtml(undefined);
    let poll: ReturnType<typeof setInterval> | undefined;
    const fail = () => {
      if (controller.signal.aborted) return;
      setStatus('error'); setHtml(undefined); controller.abort();
      clearInterval(poll); clearTimeout(timeout);
    };
    const timeout = setTimeout(fail, 15_000);
    void (async () => {
      try {
        const response = await fetch(FILM_URL, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('film_unavailable');
        const document = await response.text();
        if (document.length > 1_500_000 || !/<head[\s>]/i.test(document) || !/id=["']root["']/.test(document)) throw new Error('film_invalid');
        if (controller.signal.aborted) return;
        // This HTML is our same-origin, application-owned film, never user input.
        // Explicit base preserves its scripts, CSS, images and audio paths.
        const base = new URL(FILM_URL, window.location.href).href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        setHtml(document.replace(/<head[^>]*>/i, `$&<base href="${base}">`));
        poll = setInterval(() => {
          try {
            if (frame.current?.contentDocument?.getElementById('root')?.childElementCount) {
              setStatus('ready'); clearTimeout(timeout); clearInterval(poll);
            }
          } catch { fail(); }
        }, 200);
      } catch { fail(); }
    })();
    return () => { controller.abort(); clearInterval(poll); clearTimeout(timeout); };
  }, [attempt]);
  return <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr] lg:items-start">
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-[#2a3a50] bg-[#0b1320]">
      {html && <iframe ref={frame} data-testid="iframe-film" srcDoc={html} title="Video pengenalan Gustafta: kumpulkan, baca, tindak lanjuti" allow="autoplay; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full border-0" />}
      {status === 'loading' && <div role="status" className="absolute inset-0 grid place-items-center bg-[#0b1320] text-[#eef4fb]">Memuat video pengenalan…</div>}
      {status === 'error' && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center text-sm text-[#eef4fb]">
        <p>Video belum dapat dimuat. Coba lagi atau buka film di tab baru.</p>
        <button type="button" onClick={() => setAttempt(n => n + 1)} className="rounded-lg bg-[#4ea4ff] px-4 py-2 font-bold text-[#04111f]">Coba lagi</button>
      </div>}
      {status === 'idle' && <button type="button" data-testid="button-load-film" onClick={() => setAttempt(n => n + 1)} className="group absolute inset-0 flex flex-col items-center justify-center gap-4 text-[#eef4fb]">
          <span className="absolute inset-0 lp-grid opacity-60" />
          <span className="relative grid h-20 w-20 place-items-center rounded-full bg-[#4ea4ff] text-[#04111f] transition-transform group-hover:scale-105"><Play size={30} fill="currentColor" /></span>
          <span className="relative text-sm font-bold">Putar video pengenalan</span>
          <span className="relative mono text-[11px] uppercase tracking-[.14em] text-[#9fb4cc]">Dimuat hanya setelah Anda klik</span>
        </button>}
    </div>
    <div>
      <div data-testid="note-film-concept" role="note" className="rounded-xl border border-[var(--lp-line-2)] bg-[var(--lp-surface-blue)] p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--lp-accent)]"><Info size={16} /> Catatan tentang film ini</div>
        <p className="mt-3 text-sm leading-6 text-[var(--lp-t2)]">Kenali alur persiapan: catat bukti, baca sumber dan draf AI, lalu susun tindak lanjut. Ilustrasi ini bukan hasil pemeriksaan dokumen atau keputusan sertifikasi.</p>
        <p className="mt-3 text-sm leading-6 text-[var(--lp-t2)]">Ruang Simpan saat ini berdiri sendiri dan privat untuk akun Anda.</p>
      </div>
      <a data-testid="link-open-film" href={FILM_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--lp-accent)] hover:text-[var(--lp-text)]">Buka film di tab baru <ArrowUpRight size={15} /></a>
    </div>
  </div>;
}
