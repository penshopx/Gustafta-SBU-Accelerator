import { Link } from 'wouter';
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, FileSearch, Folder, LayoutGrid, MessagesSquare, Search, UsersRound, type LucideIcon } from 'lucide-react';
import { FilmEmbed } from './film-embed';
import './landing.css';

const scattered = [
  ['Akta perubahan', 'di email direktur', '-3deg'], ['NIB', 'versi lama di flashdisk', '2deg'], ['SKK tenaga ahli', 'masa berlaku belum dicek', '-1deg'],
  ['Laporan keuangan', 'menunggu akuntan', '3deg'], ['Pengalaman kerja', 'kontrak di folder proyek', '-2deg'], ['Aturan terbaru', 'dari grup percakapan', '1deg'],
] as const;

type Feature = { href: string; title: string; text: string; icon: LucideIcon; access: 'Publik' | 'Perlu masuk' };
const features: Feature[] = [
  { href: '/cases', title: 'Kasus SBU', text: 'Satu kasus per permohonan: deklarasi bukti, temuan celah, checklist internal SMAP, rencana tindakan, dan ekspor persiapan.', icon: BriefcaseBusiness, access: 'Perlu masuk' },
  { href: '/documents', title: 'Ruang Simpan', text: 'Simpan dokumen privat di akun Anda. Tersimpan tidak berarti terverifikasi.', icon: Folder, access: 'Perlu masuk' },
  { href: '/personnel', title: 'Personel & SKK', text: 'Catat tenaga ahli, SKK, dan penugasannya agar terhubung ke kasus.', icon: UsersRound, access: 'Perlu masuk' },
  { href: '/regulations', title: 'Pusat regulasi', text: 'Ringkasan aturan terpilih dengan tautan sumber primer dan catatan masa transisi.', icon: BookOpen, access: 'Perlu masuk' },
  { href: '/assistant', title: 'Asisten peran', text: 'Draf penjelasan AI dengan rujukan bila tersedia. Tetap perlu Anda periksa.', icon: MessagesSquare, access: 'Perlu masuk' },
  { href: '/agenda', title: 'Agenda kasus', text: 'Tenggat dan tindak lanjut dari semua kasus dalam satu daftar.', icon: CalendarDays, access: 'Perlu masuk' },
  { href: '/simulator', title: 'Simulator SBU', text: 'Latihan deklarasi persiapan baru atau perpanjangan di browser, tanpa akun.', icon: Search, access: 'Publik' },
  { href: '/mini-apps', title: 'Mini Apps', text: 'Kalkulator masa berlaku, pelacak tindakan, dan pemeriksa konsistensi identitas berkas.', icon: LayoutGrid, access: 'Publik' },
];

const outputs = [
  { tag: 'PEMERIKSAAN MANUAL', title: 'Konsistensi deklarasi', text: 'Pemeriksa identitas membandingkan apa yang Anda ketik: nama badan usaha, NIB, dan NPWP. Tidak membaca isi dokumen atau memverifikasi keasliannya.', tone: 'border-[#2c3d52]' },
  { tag: 'DRAF AI', title: 'Bahan awal, bukan kesimpulan', text: 'Asisten menyusun draf penjelasan dengan sumber bila tersedia. Draf bisa keliru; periksa kembali rujukan dan batas jawabannya.', tone: 'border-[#4ea4ff]' },
  { tag: 'VERIFIKASI MANUSIA', title: 'Keputusan tetap di tangan orang', text: 'Anda, tim, atau penelaah memeriksa sumber primer. Keputusan SBU sepenuhnya milik lembaga berwenang.', tone: 'border-[#9ccbff]' },
];

function Mark() {
  return <Link href="/" data-testid="link-brand" className="inline-flex items-center gap-2.5 text-xl font-extrabold tracking-[-.045em] text-white">
    <span className="grid h-9 w-9 place-items-center rounded-[9px] bg-[#277be5]"><span className="flex items-end gap-[2px]"><i className="h-3 w-1.5 bg-white" /><i className="h-5 w-1.5 bg-white" /><i className="h-2 w-1.5 bg-white" /></span></span>
    gustafta<span className="ml-1 hidden border-l border-[#3a4b61] pl-2 font-mono text-[9px] font-normal uppercase leading-[1.35] tracking-[.12em] text-[#9fb4cc] sm:inline-block">SBU<br />Accelerator</span>
  </Link>;
}

function Kicker({ n, children }: { n: string; children: string }) {
  return <div className="eyebrow flex items-center gap-3 text-[#9ccbff]"><span className="text-[#4ea4ff]">{n}</span><span className="h-px w-8 bg-[#2f4560]" />{children}</div>;
}

export const INDEPENDENCE_NOTE = 'Gustafta independen dan tidak terafiliasi dengan Ditjen Bina Konstruksi, LPJK, Kementerian PU atau LSBU. Bukan layanan atau kanal komunikasi lembaga berwenang.';

export default function PublicLanding() {
  return <div className="lp min-h-[100dvh]" data-testid="page-landing">
    <header className="sticky top-0 z-30 border-b border-[#1a2433] bg-[#06090fe6] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10"><Mark />
        <nav className="flex items-center gap-4">
          <Link data-testid="link-simulator" href="/simulator" className="hidden text-sm font-bold text-[#d5e2f0] hover:text-white sm:block">Simulator</Link>
          <Link data-testid="link-mini-apps" href="/mini-apps" className="hidden text-sm font-bold text-[#d5e2f0] hover:text-white md:block">Mini Apps</Link>
          <Link data-testid="link-sign-in" href="/sign-in" className="hidden text-sm font-bold text-[#d5e2f0] hover:text-white sm:block">Masuk</Link>
          <Link data-testid="link-sign-up" href="/sign-up" className="lp-btn lp-btn-blue whitespace-nowrap !min-h-[40px] !px-4 !text-[13px]">Mulai sekarang <ArrowUpRight size={15} /></Link>
        </nav>
      </div>
    </header>
    <div role="note" data-testid="note-independence" className="border-b border-[#1d3a5c] bg-[#0b1a2c] px-5 py-2.5 text-center text-xs font-semibold leading-5 text-[#cfe3f8]">{INDEPENDENCE_NOTE}</div>

    <main>
      {/* Problem */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 lp-grid" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 md:px-10 lg:grid-cols-[1.1fr_.9fr] lg:pt-24">
          <div className="fade-up">
            <Kicker n="00">PERSIAPAN SBU / JASA KONSTRUKSI</Kicker>
            <h1 className="display mt-7 text-[clamp(2.7rem,6vw,5.6rem)] font-extrabold leading-[1.02]">Berkas SBU tercecer?<br /><span className="text-[#4ea4ff]">Kumpulkan, baca, tindak lanjuti.</span></h1>
            <p className="mt-7 max-w-xl text-[17px] leading-8 text-[#c9d7e6]">Gustafta adalah ruang kerja persiapan untuk badan usaha konstruksi. Catat bukti yang Anda punya, lihat yang belum tercatat, telusuri sumber aturannya, dan susun langkah berikutnya. Kami bukan LSBU dan tidak menerbitkan apa pun.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link data-testid="link-start" href="/sign-up" className="lp-btn lp-btn-blue">Buat ruang kerja <ArrowRight size={16} /></Link>
              <Link data-testid="link-try-simulator" href="/simulator" className="lp-btn lp-btn-ghost">Coba simulator tanpa akun</Link>
            </div>
            <Link data-testid="link-login-hero" href="/sign-in" className="mt-5 inline-block text-sm font-semibold text-[#9ccbff] underline-offset-4 hover:underline">Saya sudah punya akun</Link>
          </div>
          <div className="relative">
            <div className="eyebrow mb-4 text-[#8ea3ba]">SITUASI YANG SERING TERJADI</div>
            <ul className="lp-scatter grid grid-cols-2 gap-3">
              {scattered.map(([t, w, r]) => <li key={t} style={{ ['--r' as string]: r, transform: `rotate(${r})` }} className="lp-card p-4"><div className="text-sm font-bold text-white">{t}</div><div className="mt-1 text-xs leading-5 text-[#a9bacd]">{w}</div></li>)}
            </ul>
            <div className="mt-5 rounded-xl border border-[#4ea4ff] bg-[#0b1a2c] p-4 text-sm leading-6 text-[#e3eefa]">Tidak ada yang tahu pasti mana yang sudah siap, mana yang kurang, dan aturan mana yang jadi acuan.</div>
          </div>
        </div>
      </section>

      {/* Agitate -> Solve: how it works */}
      <section className="border-t border-[#1a2433] bg-[#0a0f18]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10">
          <div className="grid gap-6 md:grid-cols-[.8fr_1.2fr] md:items-end"><div><Kicker n="01">CARA KERJA</Kicker><h2 className="display mt-4 text-4xl font-extrabold leading-tight">Dari tumpukan berkas ke daftar tindakan.</h2></div><p className="text-base leading-8 text-[#c2d1e1]">Celah yang tidak terlihat baru ketahuan saat permohonan berjalan. Gustafta membuatnya terlihat lebih awal, dari data yang Anda deklarasikan sendiri.</p></div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[#1f2b3b] bg-[#1f2b3b] md:grid-cols-4">
            {[['Buka kasus', 'Perusahaan, jenis permohonan, kualifikasi, klasifikasi.'], ['Deklarasikan bukti', 'Tandai yang ada, simpan salinan privat bila perlu.'], ['Baca temuan', 'Kebutuhan yang belum tercatat beserta sumber rujukannya.'], ['Susun tindakan', 'Penanggung jawab, tenggat, lalu ekspor ringkasan persiapan.']].map(([t, d], i) =>
              <li key={t} className="bg-[#0c121c] p-6"><span className="mono text-xs text-[#4ea4ff]">0{i + 1}</span><h3 className="display mt-6 text-xl font-extrabold text-white">{t}</h3><p className="mt-2 text-sm leading-6 text-[#b4c4d6]">{d}</p></li>)}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-10">
        <Kicker n="02">YANG SUDAH BISA DIPAKAI</Kicker>
        <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end"><h2 className="display max-w-2xl text-4xl font-extrabold leading-tight">Alat konkret, bukan janji.</h2><p className="max-w-sm text-sm leading-6 text-[#b4c4d6]">Simulator dan Mini Apps terbuka untuk umum. Ruang kerja lain memerlukan akun dan bersifat pribadi.</p></div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ href, title, text, icon: Icon, access }, i) => <li key={href} className={i === 0 ? 'sm:col-span-2 lg:row-span-2' : ''}>
            <Link href={href} data-testid={`link-feature-${href.slice(1)}`} className={`group flex h-full flex-col rounded-2xl border p-5 transition-colors ${i === 0 ? 'border-[#4ea4ff] bg-[#0d1d33]' : 'border-[#1f2b3b] bg-[#0c121c] hover:border-[#4ea4ff]'}`}>
              <div className="flex items-center justify-between"><Icon size={i === 0 ? 30 : 20} className="text-[#4ea4ff]" /><span className={`mono rounded px-2 py-0.5 text-[10px] font-bold uppercase ${access === 'Publik' ? 'bg-[#4ea4ff] text-[#04111f]' : 'bg-[#1c2a3c] text-[#c9d7e6]'}`}>{access}</span></div>
              <h3 className={`display font-extrabold text-white ${i === 0 ? 'mt-auto pt-16 text-3xl' : 'mt-5 text-lg'}`}>{title}</h3>
              <p className={`mt-2 leading-6 text-[#b9c8da] ${i === 0 ? 'max-w-md text-base' : 'text-sm'}`}>{text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#9ccbff]">Buka <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" /></span>
            </Link></li>)}
        </ul>
      </section>

      {/* Three kinds of output */}
      <section className="border-y border-[#1a2433] bg-[#0a0f18]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10">
          <Kicker n="03">TIGA JENIS HASIL, TIGA LABEL</Kicker>
          <h2 className="display mt-4 max-w-3xl text-4xl font-extrabold leading-tight">Bedakan hasil pemeriksaan, draf AI, dan keputusan manusia.</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.1fr_1.2fr]">
            {outputs.map(o => <article key={o.tag} data-testid={`card-output-${o.tag.split(' ')[0].toLowerCase()}`} className={`rounded-2xl border-t-4 bg-[#0c121c] p-6 ${o.tone}`}><div className="eyebrow text-[#9ccbff]">{o.tag}</div><h3 className="display mt-5 text-xl font-extrabold text-white">{o.title}</h3><p className="mt-3 text-sm leading-6 text-[#c2d1e1]">{o.text}</p></article>)}
          </div>
          <div className="mt-6 flex items-start gap-3 text-sm leading-6 text-[#b4c4d6]"><FileSearch size={18} className="mt-0.5 shrink-0 text-[#4ea4ff]" />Pusat regulasi memuat ringkasan aturan terpilih, bukan seluruh regulasi nasional. Selalu buka sumber primernya sebelum bertindak.</div>
        </div>
      </section>

      {/* Film */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-10">
        <Kicker n="04">KENALI ALUR PERSIAPAN</Kicker>
        <h2 className="display mt-4 mb-10 max-w-3xl text-4xl font-extrabold leading-tight">Kumpulkan, baca, tindak lanjuti.</h2>
        <FilmEmbed />
      </section>

      {/* Boundaries + Action */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-10">
        <div className="grid overflow-hidden rounded-3xl border border-[#1f2b3b] lg:grid-cols-2">
          <div className="bg-[#0c121c] p-8 md:p-12"><Kicker n="05">BATAS YANG JELAS</Kicker><ul className="mt-6 space-y-4 text-[15px] leading-7 text-[#d5e2f0]">
            <li>Status "persiapan selesai" bukan keputusan LSBU dan bukan jaminan sertifikat terbit.</li>
            <li>Bukti yang dideklarasikan atau disimpan belum berarti terverifikasi.</li>
            <li>Tidak ada pengiriman otomatis ke sistem lembaga mana pun.</li>
          </ul></div>
          <div className="bg-[#4ea4ff] p-8 text-[#04111f] md:p-12"><div className="eyebrow">MULAI HARI INI</div><h2 className="display mt-5 text-4xl font-extrabold leading-tight">Rapikan persiapan sebelum tenggat mendekat.</h2>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" data-testid="link-join-bottom" className="lp-btn bg-[#06090f] text-white">Mulai persiapan <ArrowRight size={16} /></Link><Link href="/mini-apps" data-testid="link-mini-apps-bottom" className="lp-btn border border-[#06090f]">Lihat Mini Apps</Link></div></div>
        </div>
      </section>
    </main>
    <footer className="border-t border-[#1a2433] px-5 py-8 md:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-xs leading-5 text-[#b4c4d6] sm:flex-row"><span>&copy; {new Date().getFullYear()} Gustafta &middot; Ruang kerja persiapan SBU</span><span>Independen; tidak terafiliasi dengan Ditjen Bina Konstruksi, LPJK, Kementerian PU atau LSBU.</span></div></footer>
  </div>;
}
