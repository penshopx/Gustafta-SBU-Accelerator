import * as React from 'react';
import type { Finding } from '@workspace/api-client-react';

const tracks = [
  {
    code: 'transisi',
    number: '01',
    audience: 'Untuk LSBU',
    title: 'Penyesuaian skema sertifikasi',
    trigger: 'Diktum KEEMPAT Kepdirjen 281/2026: 6 bulan sejak penetapan keputusan. Tanggal ini bukan pemicu konversi SBU.',
    detail: 'Diktum KEEMPAT Kepdirjen 281/2026 menyebut penyesuaian dan implementasi skema paling lambat 6 bulan sejak penetapan keputusan. Status terbaru Kepdirjen dan tafsir cakupannya belum terkonfirmasi/ditelaah ahli; tanggal tenggat LSBU belum layak ditampilkan.',
    status: 'Tenggat belum terverifikasi',
  },
  {
    code: 'transisi_operasional',
    number: '02',
    audience: 'Untuk layanan sertifikasi',
    title: 'Pemberlakuan operasional',
    trigger: 'Pemberlakuan operasional memakai surat Pasal 20 ayat (2) dan kesiapan SIJK. Undangan sosialisasi bukan surat pemberlakuan.',
    detail: 'Surat pengantar Kepdirjen menyebut penyesuaian SIJK dan surat Pasal 20 ayat (2) untuk pemberlakuan operasional. Kesiapan SIJK dan keberadaan/status surat belum terkonfirmasi; undangan sosialisasi bukan surat pemberlakuan.',
    status: 'Tanggal mulai belum terverifikasi',
  },
  {
    code: 'transisi_konversi',
    number: '03',
    audience: 'Untuk SBU yang sudah terbit',
    title: 'Konversi SBU eksisting',
    trigger: 'Permen PU 6/2025 Pasal 21: 6 bulan sejak terbitnya surat yang dimaksud Pasal 20 ayat (2), bukan sejak penetapan Kepdirjen. Pengecualian Pasal 21 ayat (7) tetap harus diperiksa.',
    detail: 'Permen PU 6/2025 Pasal 21 menghitung 6 bulan sejak terbitnya surat yang dimaksud Pasal 20 ayat (2), bukan sejak penetapan Kepdirjen. Keberadaan dan tanggal terbit surat belum terkonfirmasi; pengecualian pada Pasal 21 ayat (7) perlu ditinjau ahli.',
    status: 'Tenggat belum terverifikasi',
  },
];

function dateLabel(value: string | Date | undefined): string | undefined {
  if (value instanceof Date && !Number.isFinite(value.getTime())) return undefined;
  const serialized = value instanceof Date ? value.toISOString() : value;
  // The response schema coerces calendar dates to Date; Express then emits UTC
  // midnight ISO timestamps. Accept that exact wire form, not arbitrary instants.
  const day = serialized?.replace(/T00:00:00(?:\.000)?Z$/, '');
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return undefined;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function TransitionExplainer({ findings = [], unavailable = false }: { findings?: Finding[]; unavailable?: boolean }) {
  const decisions = tracks.map((track) => {
    const finding = findings.find((item) => item.code === track.code);
    const date = !unavailable && finding?.status === 'tercatat' ? dateLabel(finding.transitionDate) : undefined;
    return { ...track, finding, date };
  });
  const hasVerifiedDate = decisions.some((track) => track.date);
  return (
    <section aria-labelledby="transition-title" className="mb-7 overflow-hidden rounded-2xl border border-[#bfd5e7] bg-[#e5f2fc]">
      <div className="border-b border-[#bfd5e7] px-6 py-6 sm:px-8">
        <div className="eyebrow text-[#1769d1]">PANDUAN MEMBACA MASA TRANSISI</div>
        <h2 id="transition-title" className="display mt-2 text-2xl font-extrabold text-[#142c46]">Tiga keputusan, bukan satu tanggal.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#456780]">
          Penyesuaian skema LSBU, pemberlakuan layanan, dan konversi SBU tidak boleh disatukan menjadi satu hitungan waktu.
        </p>
      </div>
      <div className="grid gap-px bg-[#bfd5e7] md:grid-cols-3">
        {decisions.map((track) => (
          <div key={track.number} data-testid={`transition-track-${track.code}`} className="bg-[#f8fcff] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="mono grid h-9 w-9 place-items-center rounded-lg bg-[#1769d1] text-xs font-bold text-white">{track.number}</span>
              <span className="eyebrow text-[#1769d1]">{track.audience}</span>
            </div>
            <h3 className="display mt-5 text-lg font-extrabold text-[#142c46]">{track.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#526f86]">{track.date || unavailable ? track.trigger : track.detail}</p>
            {track.date && <p className="mt-2 text-sm leading-6 text-[#526f86]">{track.finding?.detail}</p>}
            <p data-testid={`transition-status-${track.code}`} className="mt-4 inline-block rounded-full bg-[#e5f2fc] px-3 py-1 text-xs font-bold text-[#1769d1]">{unavailable ? 'Status verifikasi belum tersedia' : track.date ? 'Sumber dan telaah terverifikasi' : track.status}</p>
            {!unavailable && track.date && <>
              <p data-testid={`transition-date-${track.code}`} className="mt-3 text-sm font-bold text-[#142c46]">{track.code === 'transisi_operasional' ? 'Tanggal mulai' : 'Tenggat'}: {track.date}</p>
              <p className="mt-2 break-words text-xs leading-6 text-[#526f86]">Sumber verifikasi: {track.finding?.source}</p>
            </>}
          </div>
        ))}
      </div>
      <div className="bg-[#d5eaf9] px-6 py-4 text-xs leading-6 text-[#355a76] sm:px-8">
        <p className="mb-2 font-semibold">Gustafta independen: tidak terafiliasi dengan atau mewakili Ditjen Bina Konstruksi, LPJK, Kementerian PU maupun LSBU. Aplikasi tidak terhubung ke SIJK dan tidak dapat meminta atau mengesahkan jawaban instansi.</p>
        <strong>{unavailable ? 'Status terbaru belum dapat dimuat; tanggal tidak ditampilkan.' : hasVerifiedDate ? 'Tanggal hanya ditampilkan untuk alur dengan sumber dan telaah terverifikasi.' : 'Belum ada tanggal atau hitung mundur di aplikasi.'}</strong> Keputusan penayangan dibuat terpisah per alur setelah (1) konfirmasi Ditjen Bina Konstruksi/LPJK atas nomor, penandatangan, tanggal terbit, cakupan dan status surat Pasal 20 ayat (2), kesiapan SIJK serta status Kepdirjen 281/KPTS/DK/2026; dan (2) tinjauan tertulis ahli skema/LSBU yang teridentifikasi atas diktum KEEMPAT, kesiapan SIJK, Pasal 20–21 dan pengecualian Pasal 21 ayat (7). {!hasVerifiedDate && !unavailable && <>Keberadaan surat dan telaah ahli yang sah <strong>belum terkonfirmasi</strong>; keduanya mungkin ada atau tidak ada. </>}Persetujuan satu alur tidak mengesahkan alur lain atau kelayakan permohonan. Berkas undangan sosialisasi dan naskah telaah yang pernah disampaikan <strong>tidak digunakan sebagai acuan atau pemicu tenggat</strong>. Rujukan aturan: <a href="https://jdih.pu.go.id/detail-dokumen/PermenPU-nomor-6-tahun-2025-Standar-Kegiatan-Usaha-danatau-Standar-ProdukJasa-Pelaksanaan-Pengawasan-dan-Pengenaan-Sanksi-pada-Penyelenggaraan-Perizinan-Berusaha-Berbasis-Risiko-Sektor-Pekerjaan-Umum" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Permen PU 6/2025 Pasal 20–21</a> dan Kepdirjen 281/KPTS/DK/2026 diktum KEEMPAT (salinan unggahan).
      </div>
    </section>
  );
}