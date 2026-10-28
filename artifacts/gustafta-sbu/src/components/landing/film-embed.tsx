import { useState } from 'react';
import { ArrowUpRight, Info, Play } from 'lucide-react';

// Sibling video artifact served from the same origin; never autoplayed.
export const FILM_URL = '/gustafta-film/';

export function FilmEmbed() {
  const [loaded, setLoaded] = useState(false);
  return <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr] lg:items-start">
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-[#2a3a50] bg-[#0b1320]">
      {loaded
        ? <iframe data-testid="iframe-film" src={FILM_URL} title="Film konsep Gustafta: satu sumber, akses terarah" loading="lazy" allow="fullscreen" allowFullScreen className="absolute inset-0 h-full w-full border-0" />
        : <button type="button" data-testid="button-load-film" onClick={() => setLoaded(true)} className="group absolute inset-0 flex flex-col items-center justify-center gap-4 text-[#eef4fb]">
          <span className="absolute inset-0 lp-grid opacity-60" />
          <span className="relative grid h-20 w-20 place-items-center rounded-full bg-[#4ea4ff] text-[#04111f] transition-transform group-hover:scale-105"><Play size={30} fill="currentColor" /></span>
          <span className="relative text-sm font-bold">Putar film konsep</span>
          <span className="relative mono text-[11px] uppercase tracking-[.14em] text-[#9fb4cc]">Dimuat hanya setelah Anda klik</span>
        </button>}
    </div>
    <div>
      <div data-testid="note-film-concept" role="note" className="rounded-xl border border-[#3b5878] bg-[#0e1a2a] p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-[#9ccbff]"><Info size={16} /> Catatan tentang film ini</div>
        <p className="mt-3 text-sm leading-6 text-[#d5e2f0]">Film ini adalah pengenalan konsep lama tentang sumber, akses, dan berbagi folder. Ini bukan bukti integrasi eksternal atau berbagi otomatis.</p>
        <p className="mt-3 text-sm leading-6 text-[#d5e2f0]">Ruang Simpan saat ini berdiri sendiri dan privat untuk akun Anda.</p>
      </div>
      <a data-testid="link-open-film" href={FILM_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#9ccbff] hover:text-white">Buka film di tab baru <ArrowUpRight size={15} /></a>
    </div>
  </div>;
}
