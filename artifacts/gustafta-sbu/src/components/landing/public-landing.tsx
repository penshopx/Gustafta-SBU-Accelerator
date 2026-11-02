import { Link } from 'wouter';
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, FileSearch, Folder, LayoutGrid, MessagesSquare, Search, Stethoscope, UsersRound, type LucideIcon } from 'lucide-react';
import { FilmEmbed } from './film-embed';
import { ServiceRequestForm } from './service-request-form';
import { SERVICE_WHATSAPP_DISPLAY } from '@/lib/service-request';
import { BoundaryScene, DeskScene, FlowScene, ReviewScene, SiteScene } from './illustrations';
import { ThemeToggle } from '@/components/theme-toggle';
import './landing.css';

const scattered = [
  ['Akta perubahan', 'di email direktur', '-3deg'], ['NIB', 'versi lama di flashdisk', '2deg'], ['SKK tenaga ahli', 'masa berlaku belum dicek', '-1deg'],
  ['Laporan keuangan', 'menunggu akuntan', '3deg'], ['Pengalaman kerja', 'kontrak di folder proyek', '-2deg'], ['Aturan terbaru', 'dari grup percakapan', '1deg'],
] as const;

type Feature = { href: string; title: string; text: string; icon: LucideIcon; access: 'Publik' | 'Perlu masuk' };
const features: Feature[] = [
  { href: '/cases', title: 'Kasus SBU', text: 'Persiapan baru atau perpanjangan: catatan bukti, temuan celah, checklist internal SMAP, dan ekspor ringkasan. Ruang kerja kasus (Workroom) memuat tindak lanjut dan tinjauan internal, bukan persetujuan LSBU.', icon: BriefcaseBusiness, access: 'Perlu masuk' },
  { href: '/documents', title: 'Ruang Simpan', text: 'Dokumen privat terkait kasus, bukan arsip umum atau ruang berbagi tim. Bedah Dokumen ada dalam alur dokumen: pilih kasus, berkas, versi dan halaman, tinjau pratinjau, lalu setujui pengiriman ke AI. Tersimpan tidak berarti terverifikasi.', icon: Folder, access: 'Perlu masuk' },
  { href: '/personnel', title: 'Personel & SKK', text: 'Catat personel, sertifikat SKK dan penugasan terkait kasus. Pencatatan dan indikator tanggal bukan verifikasi keaslian atau kecocokan resmi SKK–SBU.', icon: UsersRound, access: 'Perlu masuk' },
  { href: '/consultations', title: 'Klinik Konsultasi', text: 'Percakapan AI privat yang tersimpan di akun ini. Pilih dan setujui konteks kasus atau cuplikan hasil Bedah Dokumen sebelum dikirim; bukan konsultasi dengan petugas LSBU atau konsultan manusia.', icon: Stethoscope, access: 'Perlu masuk' },
  { href: '/regulations', title: 'Pusat regulasi', text: 'Ringkasan aturan terpilih dengan tautan sumber primer dan catatan masa transisi.', icon: BookOpen, access: 'Perlu masuk' },
  { href: '/assistant', title: 'Asisten peran', text: 'Draf penjelasan AI dengan rujukan bila tersedia. Tetap perlu Anda periksa.', icon: MessagesSquare, access: 'Perlu masuk' },
  { href: '/agenda', title: 'Agenda kasus', text: 'Tenggat dan tindak lanjut dari semua kasus dalam satu daftar.', icon: CalendarDays, access: 'Perlu masuk' },
  { href: '/simulator', title: 'Simulator SBU', text: 'Latihan deklarasi persiapan baru atau perpanjangan di browser, tanpa akun.', icon: Search, access: 'Publik' },
  { href: '/mini-apps', title: 'Mini Apps', text: 'Kalkulator masa berlaku, pelacak tindakan, dan pemeriksa konsistensi identitas berkas.', icon: LayoutGrid, access: 'Publik' },
];

const outputs = [
  { tag: 'PEMERIKSAAN MANUAL', title: 'Konsistensi deklarasi', text: 'Pemeriksa identitas membandingkan apa yang Anda ketik: nama badan usaha, NIB, dan NPWP. Tidak membaca isi dokumen atau memverifikasi keasliannya.', tone: 'border-[var(--lp-line-2)]' },
  { tag: 'DRAF AI', title: 'Bahan awal, bukan kesimpulan', text: 'Bedah Dokumen, Asisten peran dan Klinik Konsultasi memberi bantuan awal. Pilih konteks dan berikan persetujuan sebelum mengirim ke AI; tidak ada pembacaan semua berkas otomatis. Hasil bisa keliru, bukan verifikasi dokumen atau keputusan sertifikasi, dan tidak otomatis mengubah bukti atau penilaian.', tone: 'border-[var(--lp-blue)]' },
  { tag: 'VERIFIKASI MANUSIA', title: 'Keputusan tetap di tangan orang', text: 'Anda, tim, atau penelaah memeriksa sumber primer. Keputusan SBU sepenuhnya milik lembaga berwenang.', tone: 'border-[var(--lp-blue-2)]' },
];

function Mark() {
  return <Link href="/" data-testid="link-brand" className="inline-flex shrink-0 items-center gap-2.5 text-xl font-extrabold max-[359px]:gap-2 max-[359px]:text-lg tracking-[-.045em] text-[var(--lp-text)]">
    <span className="grid h-9 w-9 shrink-0 place-items-center max-[359px]:h-8 max-[359px]:w-8 rounded-[9px] bg-[#277be5]"><span className="flex items-end gap-[2px]"><i className="h-3 w-1.5 bg-white" /><i className="h-5 w-1.5 bg-white" /><i className="h-2 w-1.5 bg-white" /></span></span>
    gustafta<span className="ml-1 hidden border-l border-[var(--lp-line-2)] pl-2 font-mono text-[9px] font-normal uppercase leading-[1.35] tracking-[.12em] text-[var(--lp-t3)] sm:inline-block">SBU<br />Accelerator</span>
  </Link>;
}

function Kicker({ n, children }: { n: string; children: string }) {
  return <div className="eyebrow flex items-center gap-3 text-[var(--lp-accent)]"><span className="text-[var(--lp-blue-text)]">{n}</span><span className="h-px w-8 bg-[var(--lp-line-2)]" />{children}</div>;
}

export const INDEPENDENCE_NOTE = 'Gustafta independen dan tidak terafiliasi dengan Ditjen Bina Konstruksi, LPJK, Kementerian PU atau LSBU. Bukan layanan atau kanal komunikasi lembaga berwenang.';

export default function PublicLanding() {
  return <div className="lp min-h-[100dvh]" data-testid="page-landing">
    <header className="sticky top-0 z-30 border-b border-[var(--lp-line)] bg-[var(--lp-header)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-5 py-4 max-[359px]:px-3 md:px-10"><Mark />
        <nav className="flex shrink-0 items-center gap-3 max-[359px]:gap-2 sm:gap-4">
          <Link data-testid="link-simulator" href="/simulator" className="hidden text-sm font-bold text-[var(--lp-t2)] hover:text-[var(--lp-text)] sm:block">Simulator</Link>
          <Link data-testid="link-mini-apps" href="/mini-apps" className="hidden text-sm font-bold text-[var(--lp-t2)] hover:text-[var(--lp-text)] md:block">Mini Apps</Link>
          <a data-testid="link-service-header" href="#layanan-pengurusan" className="hidden text-sm font-bold text-[var(--lp-t2)] hover:text-[var(--lp-text)] lg:block">Jasa pengurusan</a>
          <Link data-testid="link-sign-in" href="/sign-in" className="hidden text-sm font-bold text-[var(--lp-t2)] hover:text-[var(--lp-text)] sm:block">Masuk</Link>
          <ThemeToggle className="max-[359px]:!h-9 max-[359px]:!w-9" />
          <Link data-testid="link-sign-up" href="/sign-up" className="lp-btn lp-btn-blue whitespace-nowrap !min-h-[40px] !px-4 !text-[13px] max-[359px]:!gap-1 max-[359px]:!px-3 max-[359px]:!text-[12px]">Mulai sekarang <ArrowUpRight size={15} className="max-[359px]:hidden" aria-hidden="true" /></Link>
        </nav>
      </div>
    </header>
    <div role="note" data-testid="note-independence" className="border-b border-[var(--lp-line-2)] bg-[var(--lp-surface-blue)] px-5 py-2.5 text-center text-xs font-semibold leading-5 text-[var(--lp-t2)]">{INDEPENDENCE_NOTE}</div>

    <main>
      {/* Problem */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 lp-grid" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 md:px-10 lg:grid-cols-[1.1fr_.9fr] lg:pt-24">
          <div className="fade-up">
            <Kicker n="00">PERSIAPAN SBU / JASA KONSTRUKSI</Kicker>
            <h1 className="display mt-7 text-[clamp(2.7rem,6vw,5.6rem)] font-extrabold leading-[1.02]">Berkas SBU tercecer?<br /><span className="text-[var(--lp-blue-text)]">Kumpulkan, baca, tindak lanjuti.</span></h1>
            <p className="mt-7 max-w-xl text-[17px] leading-8 text-[var(--lp-t2)]">Gustafta adalah ruang kerja persiapan untuk badan usaha konstruksi. Catat bukti yang Anda punya, lihat yang belum tercatat, telusuri sumber aturannya, dan susun langkah berikutnya. Kami bukan LSBU dan tidak menerbitkan apa pun.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link data-testid="link-start" href="/sign-up" className="lp-btn lp-btn-blue">Buat ruang kerja <ArrowRight size={16} /></Link>
              <Link data-testid="link-try-simulator" href="/simulator" className="lp-btn lp-btn-ghost">Coba simulator tanpa akun</Link>
            </div>
            <Link data-testid="link-login-hero" href="/sign-in" className="mt-5 inline-block text-sm font-semibold text-[var(--lp-accent)] underline-offset-4 hover:underline">Saya sudah punya akun</Link>
            <a data-testid="link-service-hero" href="#layanan-pengurusan" className="mt-3 block text-sm font-semibold text-[var(--lp-t2)] underline underline-offset-4 hover:text-[var(--lp-text)]">Ingin dibantu menyiapkan dokumen? Isi formulir kontak awal</a>
            <SiteScene className="mt-10 max-w-[520px] opacity-95" />
          </div>
          <div className="relative">
            <div className="eyebrow mb-4 text-[var(--lp-t3)]">SITUASI YANG SERING TERJADI</div>
            <ul className="lp-scatter grid grid-cols-2 gap-3">
              {scattered.map(([t, w, r]) => <li key={t} style={{ ['--r' as string]: r, transform: `rotate(${r})` }} className="lp-card p-4"><div className="text-sm font-bold text-[var(--lp-text)]">{t}</div><div className="mt-1 text-xs leading-5 text-[var(--lp-t3)]">{w}</div></li>)}
            </ul>
            <div className="mt-5 rounded-xl border border-[var(--lp-blue)] bg-[var(--lp-surface-blue)] p-4 text-sm leading-6 text-[var(--lp-text)]">Tidak ada yang tahu pasti mana yang sudah siap, mana yang kurang, dan aturan mana yang jadi acuan.</div>
          </div>
        </div>
      </section>

      {/* Introduction video, immediately after the opening */}
      <section data-testid="section-introduction-video" className="mx-auto max-w-7xl px-5 py-20 md:px-10">
        <Kicker n="01">KENALI ALUR PERSIAPAN</Kicker>
        <h2 className="display mt-4 mb-10 max-w-3xl text-4xl font-extrabold leading-tight">Kumpulkan, baca, tindak lanjuti.</h2>
        <FilmEmbed />
      </section>

      {/* Agitate -> Solve: how it works */}
      <section className="border-t border-[var(--lp-line)] bg-[var(--lp-bg-alt)]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10">
          <div className="grid gap-6 md:grid-cols-[.8fr_1.2fr] md:items-end"><div><Kicker n="02">CARA KERJA</Kicker><h2 className="display mt-4 text-4xl font-extrabold leading-tight">Dari tumpukan berkas ke daftar tindakan.</h2></div><p className="text-base leading-8 text-[var(--lp-t2)]">Celah yang tidak terlihat baru ketahuan saat permohonan berjalan. Gustafta membuatnya terlihat lebih awal, dari data yang Anda deklarasikan sendiri.</p></div>
          <FlowScene className="mt-12 hidden md:block" />
          <ol className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-line)] md:grid-cols-4">
            {[['Buka kasus', 'Perusahaan, jenis permohonan, kualifikasi, klasifikasi.'], ['Deklarasikan bukti', 'Tandai yang ada, simpan salinan privat bila perlu.'], ['Baca temuan', 'Kebutuhan yang belum tercatat beserta sumber rujukannya.'], ['Susun tindakan', 'Penanggung jawab, tenggat, lalu ekspor ringkasan persiapan.']].map(([t, d], i) =>
              <li key={t} className="bg-[var(--lp-surface)] p-6"><span className="mono text-xs text-[var(--lp-blue-text)]">0{i + 1}</span><h3 className="display mt-6 text-xl font-extrabold text-[var(--lp-text)]">{t}</h3><p className="mt-2 text-sm leading-6 text-[var(--lp-t3)]">{d}</p></li>)}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section data-testid="section-local-features" className="mx-auto max-w-7xl px-5 py-20 md:px-10">
        <Kicker n="03">YANG SUDAH BISA DIPAKAI</Kicker>
        <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end"><h2 className="display max-w-2xl text-4xl font-extrabold leading-tight">Alat konkret, bukan janji.</h2><div className="flex items-end gap-6"><p className="max-w-sm text-sm leading-6 text-[var(--lp-t3)]">Simulator dan Mini Apps terbuka untuk umum. Ruang kerja lain memerlukan akun dan bersifat pribadi.</p><DeskScene className="hidden w-[220px] shrink-0 lg:block" /></div></div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ href, title, text, icon: Icon, access }, i) => <li key={href} className={i === 0 ? 'sm:col-span-2 lg:row-span-2' : ''}>
            <Link href={href} data-testid={`link-feature-${href.slice(1)}`} className={`group flex h-full flex-col rounded-2xl border p-5 transition-colors ${i === 0 ? 'border-[var(--lp-blue)] bg-[var(--lp-surface-blue)]' : 'border-[var(--lp-line)] bg-[var(--lp-surface)] hover:border-[var(--lp-blue)]'}`}>
              <div className="flex items-center justify-between"><Icon size={i === 0 ? 30 : 20} className="text-[var(--lp-blue-text)]" /><span className={`mono rounded px-2 py-0.5 text-[10px] font-bold uppercase ${access === 'Publik' ? 'bg-[#4ea4ff] text-[#04111f]' : 'bg-[var(--lp-chip)] text-[var(--lp-t2)]'}`}>{access}</span></div>
              <h3 className={`display font-extrabold text-[var(--lp-text)] ${i === 0 ? 'mt-auto pt-16 text-3xl' : 'mt-5 text-lg'}`}>{title}</h3>
              <p className={`mt-2 leading-6 text-[var(--lp-t3)] ${i === 0 ? 'max-w-md text-base' : 'text-sm'}`}>{text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[var(--lp-accent)]">Buka <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" /></span>
            </Link></li>)}
        </ul>
        <div data-testid="note-sbu-skk-path" className="mt-6 rounded-2xl border border-[var(--lp-line-2)] bg-[var(--lp-surface-blue)] p-5 text-sm leading-7 text-[var(--lp-t2)]">
          <h3 className="display font-extrabold text-[var(--lp-text)]">Jalur persiapan SBU–SKK</h3>
          <p className="mt-2">Mulai latihan di <Link href="/simulator" className="font-bold underline underline-offset-4">Simulator SBU</Link>, kelola permohonan di <Link href="/cases" className="font-bold underline underline-offset-4">Kasus SBU</Link>, lalu catat personel dan penugasannya di <Link href="/personnel" className="font-bold underline underline-offset-4">Personel &amp; SKK</Link>. Tidak menyediakan pengajuan, pelatihan, atau penerbitan SKK.</p>
        </div>
        <div data-testid="section-audiences" className="mt-6 grid min-w-0 gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-5">
            <h3 className="display text-lg font-extrabold text-[var(--lp-text)]">Untuk badan usaha / kontraktor</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--lp-t2)]">Rapikan dokumen per permohonan, catat yang belum tersedia, dan susun tindak lanjut persiapan baru maupun perpanjangan.</p>
          </article>
          <article className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-5">
            <h3 className="display text-lg font-extrabold text-[var(--lp-text)]">Untuk konsultan / pendamping pengurusan</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--lp-t2)]">Gunakan catatan kasus dan ringkasan persiapan untuk membantu penelaahan. Bukan dashboard klien bersama; tidak ada undangan tim atau akses lintas akun.</p>
          </article>
        </div>
        <p data-testid="note-feature-access" className="mt-5 text-sm leading-7 text-[var(--lp-t3)]">Masuk diperlukan untuk fitur privat; Kasus SBU dan ruang kerja di dalamnya tersedia bagi peran kontraktor dan konsultan. Memilih mode chat atau menuliskan penanggung jawab tidak menambah hak akses.</p>
      </section>

      {/* Three kinds of output */}
      <section className="border-y border-[var(--lp-line)] bg-[var(--lp-bg-alt)]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10">
          <Kicker n="04">TIGA JENIS HASIL, TIGA LABEL</Kicker>
          <div className="mt-4 flex items-end justify-between gap-8"><h2 className="display max-w-3xl text-4xl font-extrabold leading-tight">Bedakan hasil pemeriksaan, draf AI, dan keputusan manusia.</h2><ReviewScene className="hidden w-[200px] shrink-0 md:block" /></div>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.1fr_1.2fr]">
            {outputs.map(o => <article key={o.tag} data-testid={`card-output-${o.tag.split(' ')[0].toLowerCase()}`} className={`rounded-2xl border-t-4 bg-[var(--lp-surface)] p-6 ${o.tone}`}><div className="eyebrow text-[var(--lp-accent)]">{o.tag}</div><h3 className="display mt-5 text-xl font-extrabold text-[var(--lp-text)]">{o.title}</h3><p className="mt-3 text-sm leading-6 text-[var(--lp-t2)]">{o.text}</p></article>)}
          </div>
          <div className="mt-6 flex items-start gap-3 text-sm leading-6 text-[var(--lp-t3)]"><FileSearch size={18} className="mt-0.5 shrink-0 text-[var(--lp-blue-text)]" />Pusat regulasi memuat ringkasan aturan terpilih, bukan seluruh regulasi nasional. Selalu buka sumber primernya sebelum bertindak.</div>
        </div>
      </section>

      {/* Service enquiry */}
      <section id="layanan-pengurusan" data-testid="section-service-request" className="scroll-mt-24 border-t border-[var(--lp-line)] bg-[var(--lp-bg-alt)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:px-10 lg:grid-cols-[.8fr_1.2fr]">
          <div><Kicker n="05">JASA PENGURUSAN DOKUMEN</Kicker>
            <h2 className="display mt-4 text-4xl font-extrabold leading-tight">Ingin dibantu menyiapkan berkas permohonan SBU?</h2>
            <p className="mt-5 text-base leading-7 text-[var(--lp-t2)]">Ceritakan kebutuhan Anda. Formulir ini menyusun pesan kontak awal untuk pengelola Gustafta. Kami membantu menyiapkan bukti dan dokumen; penilaian dan penerbitan SBU tetap wewenang lembaga sertifikasi.</p>
            <ol className="mt-8 space-y-4 text-sm leading-6 text-[var(--lp-t2)]">
              {['Isi kebutuhan di formulir.', 'Tinjau ringkasan pesan persis seperti yang akan dikirim.', 'Buka WhatsApp dan tekan kirim sendiri.'].map((t, i) => <li key={t} className="flex gap-3"><span className="mono text-[var(--lp-blue-text)]">0{i + 1}</span>{t}</li>)}
            </ol>
            <div data-testid="text-service-destination" className="mt-8 rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-4 text-sm leading-6 text-[var(--lp-t2)]">WhatsApp pengelola: <strong className="mono text-[var(--lp-text)]">{SERVICE_WHATSAPP_DISPLAY}</strong><br />Isian tidak disimpan di situs ini. Informasi baru keluar saat Anda membuka tautan WhatsApp. Ini permintaan kontak awal, bukan pengajuan resmi, dan tidak menjamin SBU terbit.</div>
          </div>
          <ServiceRequestForm />
        </div>
      </section>

      {/* Boundaries + Action */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-10">
        <div className="grid overflow-hidden rounded-3xl border border-[var(--lp-line)] lg:grid-cols-2">
          <div className="bg-[var(--lp-surface)] p-8 md:p-12"><Kicker n="06">BATAS YANG JELAS</Kicker><ul className="mt-6 space-y-4 text-[15px] leading-7 text-[var(--lp-t2)]">
            <li>Status "persiapan selesai" bukan keputusan LSBU dan bukan jaminan sertifikat terbit.</li>
            <li>Bukti yang dideklarasikan atau disimpan belum berarti terverifikasi.</li>
            <li>Tidak ada pengiriman otomatis ke sistem lembaga mana pun.</li>
            <li>Aplikasi SBU berdiri sendiri. Akun, profil dan dokumen tidak disinkronkan dengan Gustafta.my.id atau aplikasi lain.</li>
          </ul><BoundaryScene className="mt-10 max-w-[420px]" /></div>
          <div className="bg-[#4ea4ff] p-8 text-[#04111f] md:p-12"><div className="eyebrow">MULAI HARI INI</div><h2 className="display mt-5 text-4xl font-extrabold leading-tight">Rapikan persiapan sebelum tenggat mendekat.</h2>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" data-testid="link-join-bottom" className="lp-btn lp-btn-ink">Mulai persiapan <ArrowRight size={16} /></Link><Link href="/mini-apps" data-testid="link-mini-apps-bottom" className="lp-btn border border-[var(--lp-ink-border)]">Lihat Mini Apps</Link></div></div>
        </div>
      </section>
    </main>
    <footer className="border-t border-[var(--lp-line)] px-5 py-8 md:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-xs leading-5 text-[var(--lp-t3)] sm:flex-row"><span>&copy; {new Date().getFullYear()} Gustafta &middot; Ruang kerja persiapan SBU</span><span>Independen; tidak terafiliasi dengan Ditjen Bina Konstruksi, LPJK, Kementerian PU atau LSBU.</span></div></footer>
  </div>;
}
