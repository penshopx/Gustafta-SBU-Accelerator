import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, BriefcaseBusiness, CalendarClock, FileSearch, Folder, ListChecks, Search, UsersRound, type LucideIcon } from 'lucide-react';
import { ExpiryCalculator } from '@/components/mini-apps/expiry-calculator';
import { ActionTracker, type ActionTrackerHandle } from '@/components/mini-apps/action-tracker';
import { IdentityConsistency } from '@/components/mini-apps/identity-consistency';

type Cat = 'semua' | 'lokal' | 'kasus' | 'bukti' | 'rujukan';
type App = { id: string; title: string; text: string; cat: Exclude<Cat, 'semua'>; href: string; anchor?: boolean; access: 'Publik' | 'Perlu masuk'; icon: LucideIcon; tags: string };
const CATS: [Cat, string][] = [['semua', 'Semua'], ['lokal', 'Alat lokal'], ['kasus', 'Kasus'], ['bukti', 'Bukti & personel'], ['rujukan', 'Rujukan']];
export const MINI_APPS: App[] = [
  { id: 'expiry', title: 'Sisa masa berlaku SBU/SKK', text: 'Hitung hari kalender menuju atau sejak tanggal berakhir, dengan tanggal acuan pilihan Anda.', cat: 'lokal', href: '#kalkulator-masa-berlaku', anchor: true, access: 'Publik', icon: CalendarClock, tags: 'kadaluarsa tanggal perpanjangan' },
  { id: 'tracker', title: 'Pelacak tindakan manual', text: 'Daftar tindakan sementara dengan penanggung jawab dan tenggat, lalu unduh sebagai teks.', cat: 'lokal', href: '#pelacak-tindakan', anchor: true, access: 'Publik', icon: ListChecks, tags: 'todo rencana tugas' },
  { id: 'identity', title: 'Pemeriksa konsistensi identitas berkas', text: 'Bandingkan nama badan usaha, NIB, dan NPWP yang Anda ketik dari beberapa berkas.', cat: 'lokal', href: '#pemeriksa-identitas', anchor: true, access: 'Publik', icon: FileSearch, tags: 'nib npwp nama perusahaan konsisten dokumen' },
  { id: 'simulator', title: 'Simulator SBU', text: 'Latihan deklarasi persiapan empat langkah, lokal di browser, dengan laporan teks.', cat: 'lokal', href: '/simulator', access: 'Publik', icon: Search, tags: 'latihan simulasi' },
  { id: 'cases', title: 'Kasus SBU', text: 'Checklist per kasus, temuan celah, rencana tindakan, dan ekspor persiapan ada di dalam setiap kasus.', cat: 'kasus', href: '/cases', access: 'Perlu masuk', icon: BriefcaseBusiness, tags: 'checklist gap celah rencana ekspor' },
  { id: 'smap', title: 'Checklist internal SMAP', text: 'Ada di dalam setiap kasus: buka Kasus SBU, pilih kasus, lalu isi deklarasi dan telaah internal per butir. Bukan sertifikasi.', cat: 'kasus', href: '/cases', access: 'Perlu masuk', icon: BriefcaseBusiness, tags: 'smap anti penyuapan checklist telaah' },
  { id: 'personnel', title: 'Personel & SKK', text: 'Catat personel, SKK, dan penugasan untuk dikaitkan dengan kasus.', cat: 'bukti', href: '/personnel', access: 'Perlu masuk', icon: UsersRound, tags: 'tenaga ahli skk' },
  { id: 'documents', title: 'Ruang Simpan', text: 'Simpan dokumen privat. Disimpan tidak berarti terverifikasi.', cat: 'bukti', href: '/documents', access: 'Perlu masuk', icon: Folder, tags: 'dokumen berkas arsip' },
  { id: 'regulations', title: 'Pusat regulasi', text: 'Ringkasan aturan dengan sumber primer dan catatan masa transisi.', cat: 'rujukan', href: '/regulations', access: 'Perlu masuk', icon: BookOpen, tags: 'aturan permen peraturan' },
];

export default function MiniAppsPage() {
  const tracker = useRef<ActionTrackerHandle>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('semua');
  useEffect(() => { const t = document.title; document.title = 'Mini Apps SBU - Gustafta'; return () => { document.title = t; }; }, []);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return MINI_APPS.filter(a => (cat === 'semua' || a.cat === cat) && (!s || `${a.title} ${a.text} ${a.tags}`.toLowerCase().includes(s))); }, [q, cat]);

  return <div className="min-h-[100dvh] bg-[#eef5fa] text-[#14253a]">
    <header className="border-b border-[#d2e0ea] bg-[#f9fcfe]"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" data-testid="link-mini-home" className="text-sm font-extrabold">gustafta <span className="mono text-[10px] font-normal uppercase tracking-widest text-[#56718a]">Mini Apps SBU</span></Link><Link href="/dashboard" data-testid="link-mini-workspace" className="text-sm font-bold text-[#1769d1]">Ruang kerja</Link></div></header>
    <section className="relative overflow-hidden bg-[#101f32] text-white"><div className="absolute inset-0 grid-paper opacity-25" /><div className="relative mx-auto max-w-6xl px-5 py-10 md:py-14"><div className="eyebrow text-[#8ec7f4]">MINI APPS / SIAP PAKAI</div><h1 className="display mt-3 text-[clamp(2rem,4.5vw,3.3rem)] font-extrabold leading-[1.05]">Alat kecil untuk persiapan SBU.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#bad0e2]">Untuk persiapan sertifikasi badan usaha konstruksi, bukan keputusan LSBU. Alat lokal di halaman ini hanya memakai data yang Anda ketik, tidak membaca dokumen, dan tidak menyimpan apa pun.</p></div></section>
    <main className="mx-auto max-w-6xl px-5 py-8 md:py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80"><label htmlFor="mini-search" className="sr-only">Cari mini app</label><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#688096]" /><input id="mini-search" type="search" data-testid="input-mini-search" className="field !pl-9" placeholder="Cari alat, mis. SKK" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div role="group" aria-label="Filter kategori" className="flex flex-wrap gap-1.5">{CATS.map(([v, l]) => <button key={v} type="button" aria-pressed={cat === v} data-testid={`filter-${v}`} onClick={() => setCat(v)} className={`min-h-[36px] rounded-full border px-3.5 text-xs font-bold transition-colors ${cat === v ? 'border-[#14253a] bg-[#14253a] text-white' : 'border-[#bfd0de] bg-white text-[#2b4159] hover:bg-[#eef6fc]'}`}>{l}</button>)}</div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{list.length} alat ditampilkan</p>
      {list.length === 0 ? <div data-testid="empty-mini" className="mt-6 rounded-xl border border-dashed border-[#bfcedc] bg-white p-8 text-center"><p className="font-bold">Tidak ada alat yang cocok.</p><button type="button" onClick={() => { setQ(''); setCat('semua'); }} className="btn btn-outline mt-3">Reset pencarian</button></div>
        : <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map(a => { const Icon = a.icon; const body = <><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#eaf4ff] text-[#1769d1] transition-colors group-hover:bg-[#1769d1] group-hover:text-white"><Icon size={17} /></span><span className={`mono rounded px-2 py-0.5 text-[10px] font-bold uppercase ${a.access === 'Publik' ? 'bg-[#e3f4ee] text-[#155f4e]' : 'bg-[#eef2f6] text-[#3d5267]'}`}>{a.access}</span></div><h3 className="display mt-4 text-base font-extrabold">{a.title}</h3><p className="mt-1.5 flex-1 text-sm leading-6 text-[#526b81]">{a.text}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1769d1]">{a.anchor ? 'Pakai di halaman ini' : 'Buka'} <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" /></span></>; const cls = 'group flex h-full flex-col rounded-xl border border-[#d1dfe9] bg-white p-4 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[#1769d1] focus-visible:outline-2 focus-visible:outline-[#1769d1]'; return <li key={a.id}>{a.anchor ? <a href={a.href} data-testid={`link-mini-${a.id}`} className={cls}>{body}</a> : <Link href={a.href} data-testid={`link-mini-${a.id}`} className={cls}>{body}</Link>}</li>; })}</ul>}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:items-start"><ExpiryCalculator /><ActionTracker ref={tracker} /></div>
      <div className="mt-6"><IdentityConsistency onAddActions={titles => tracker.current?.appendTitles(titles) ?? 0} /></div>
      <p className="mt-8 text-xs leading-5 text-[#526b81]">Gustafta independen dan tidak terafiliasi dengan Ditjen Bina Konstruksi, LPJK, Kementerian PU, atau LSBU. Hasil alat bukan verifikasi, bukan sertifikasi, dan bukan jaminan penerbitan.</p>
    </main>
  </div>;
}
