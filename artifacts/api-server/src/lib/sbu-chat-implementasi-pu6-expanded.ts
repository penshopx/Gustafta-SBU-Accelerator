import type { ChatSourceVersion } from "./sbu-chat-retrieval";
import { IMPLEMENTASI_PU6_VERSIONS } from "./sbu-chat-implementasi-pu6";

// Preserve the historical citation snapshot; expand under the SAME source key
// so a withdrawal cannot be bypassed by introducing an alias for this PDF.
const previous = IMPLEMENTASI_PU6_VERSIONS[0];
const versionId = "implementasi-pu6-20261104-r2";
const entries = [
  {
    id: "implementasi-pu6-legalitas", page: "16", title: "Memahami Perizinan Berusaha Berbasis Risiko",
    excerpt: "Paparan membedakan NIB, Sertifikat Standar melalui pernyataan mandiri, Sertifikat Standar yang diverifikasi, serta izin pemerintah menurut tingkat risiko. Materi mengaitkan penjelasan dengan PP 28/2025 dan fokus subsektor jasa konstruksi.",
    limitation: "Bukan penetapan risiko atau persyaratan legalitas untuk KBLI/BUJK tertentu. Tidak menyimpulkan NIB saja cukup untuk permohonan SBU, dan tidak memverifikasi status OSS atau Sertifikat Standar.",
    terms: ["legalitas", "oss", "nib", "sertifikat standar", "perizinan berbasis risiko", "pp 28/2025"],
  },
  {
    id: "implementasi-pu6-oss", page: "17–18", title: "Standar Kegiatan Usaha Jasa Konstruksi dan Ketentuan Permohonan",
    excerpt: "Paparan membahas pemenuhan standar melalui OSS serta membedakan kemampuan BUJK/SBU, lisensi LSBU, dan lisensi LSP. Diagram permohonan membedakan penyampaian SBU melalui LSBU dari permohonan lisensi LSBU melalui portal, dengan rujukan standar skema sertifikasi.",
    limitation: "Diagram bukan petunjuk layar OSS terkini atau bukti portal sudah terintegrasi. SBU BUJK tidak sama dengan lisensi LSBU/LSP. Aplikasi ini tidak mengirim permohonan ke OSS, LSBU atau portal Kementerian.",
    terms: ["oss", "standar kegiatan usaha", "lisensi lsbu", "lisensi lsp", "portal kementerian", "permohonan melalui lsbu"],
  },
  {
    id: "implementasi-pu6-tkk", page: "62", title: "Kriteria Ketersediaan Tenaga Kerja Konstruksi (TKK) BUJK",
    excerpt: "Paparan membahas PJBU sebagai penanggung jawab badan usaha, PJTBU sebagai penanggung jawab teknik, dan PJKBU sebagai penanggung jawab klasifikasi. Materi mengaitkan PJTBU/PJKBU dengan SKK sesuai subklasifikasi serta membahas penunjukan, penugasan dan penggantian personel melalui SIJK terintegrasi.",
    limitation: "Istilah jabatan dalam slide bukan pemetaan final semua skema. Ketentuan rangkap jabatan, hubungan kerja dan penggantian perlu diperiksa terhadap sumber primer dan skema yang berlaku. Catatan Personel/SKK lokal bukan verifikasi keaslian, penetapan jabatan, atau pelaporan SIJK.",
    terms: ["tenaga kerja", "tkk", "pjbu", "pjtbu", "pjkbu", "penugasan", "penggantian personel"],
  },
  {
    id: "implementasi-pu6-skk", page: "63–64", title: "Kebutuhan TKK dan SKK menurut Kelompok Kualifikasi",
    excerpt: "Tabel paparan membedakan kebutuhan personel dan jenjang SKK untuk subkualifikasi kecil serta kelompok menengah dan besar. Materi juga membahas perangkapan jabatan, multi-klasifikasi dan pemilihan jenjang pada kondisi multi-subklasifikasi.",
    limitation: "Angka jumlah personel, jenjang, dan pengecualian dalam tabel belum diadopsi sebagai matriks SKK–SBU. Jangan menyimpulkan satu SKK memenuhi seluruh subklasifikasi, mengizinkan rangkap jabatan, atau menetapkan kelayakan tanpa telaah skema dan sumber primer.",
    terms: ["skk", "jenjang skk", "persyaratan personel", "multi-klasifikasi", "multi-subklasifikasi", "perangkapan jabatan"],
  },
  {
    id: "implementasi-pu6-tahapan", page: "73", title: "Tahapan Permohonan SBU Konstruksi",
    excerpt: "Diagram menggambarkan registrasi, kelengkapan data keuangan dan penjualan, TKK/peralatan serta SMAP, dilanjutkan proses sertifikasi dan pembayaran LSBU, penilaian/validasi, serta penerbitan SBU digital. Slide juga menggambarkan pertukaran data antarsistem eksternal.",
    limitation: "Ini gambaran alur pada paparan, bukan jaminan urutan layar, tarif, durasi layanan atau integrasi yang aktif. Menyimpan kasus/bukti di aplikasi tidak mendaftarkan permohonan resmi, membayar LSBU, memvalidasi dokumen, atau menerbitkan SBU.",
    terms: ["tahapan permohonan", "registrasi", "kelengkapan data", "pembayaran lsbu", "sbu digital", "alur sertifikasi"],
  },
  {
    id: "implementasi-pu6-jenis", page: "77", title: "Ragam Permohonan dan Keputusan Akhir",
    excerpt: "Paparan menyebut permohonan baru, perpanjangan, perubahan kualifikasi, perubahan data dan pencabutan. Diagram memisahkan registrasi/pembayaran, verifikasi dan validasi, lalu keputusan akhir berupa persetujuan atau penolakan oleh otoritas terkait.",
    limitation: "Cakupan aplikasi tetap pendamping persiapan baru/perpanjangan; slide tidak menambah jenis layanan otomatis. Uraian sanksi dan masa pemulihan pada halaman ini bukan keputusan terhadap BUJK tertentu dan tidak diaktifkan sebagai tenggat atau aturan penilaian.",
    terms: ["jenis permohonan", "permohonan baru", "perpanjangan", "perubahan kualifikasi", "perubahan data", "pencabutan", "persetujuan", "penolakan"],
  },
] as const;

const { id: _id, locator: _locator, excerpt: _excerpt, limitation: _limitation, ...metadata } = previous.citations[0];
const reversion = (id: string) => `${id.split("@")[0]}@${versionId}`;
export const IMPLEMENTASI_PU6_EXPANDED: ChatSourceVersion = {
  sourceKey: previous.sourceKey, versionId, baseline: true,
  citations: [
    ...previous.citations.map(c => ({ ...c, id: reversion(c.id) })),
    ...entries.map(e => ({
      ...metadata, id: `${e.id}@${versionId}`,
      locator: `PDF hlm. ${e.page} — ${e.title}`,
      excerpt: e.excerpt,
      limitation: `${e.limitation} Tautan JDIH adalah kanal rujukan regulasi, bukan URL penerbit PDF atau bukti asal paparan.`,
    })),
  ],
  keywords: {
    ...Object.fromEntries(Object.entries(previous.keywords).map(([id, words]) => [reversion(id), words])),
    ...Object.fromEntries(entries.map(e => [`${e.id}@${versionId}`, [...e.terms]])),
  },
};
