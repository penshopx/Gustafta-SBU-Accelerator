import type { ChatSourceVersion } from "./sbu-chat-retrieval";

// Bounded visual curation of an uploaded discussion deck, not legal approval.
// Page evidence and limitations: docs/knowledge-intake-implementasi-pu6.md.
const versionId = "implementasi-pu6-20261104-r1";
const entries = [
  {
    id: "implementasi-pu6-lkut", page: 25, title: "Kewajiban Pelaporan Kegiatan Usaha Tahunan (LKUT) BUJK",
    excerpt: "Paparan membedakan kelompok bahan LKUT untuk kualifikasi kecil serta menengah, besar dan spesialis. Bahan yang dibahas meliputi keuangan, kepatuhan perizinan, kegiatan PUB, serta kinerja manajemen dan proyek sesuai kelompoknya.",
    limitation: "Pembagian bahan dan tenggat dalam slide perlu dicocokkan dengan sumber primer Permen PUPR 7/2024 dan aturan yang berlaku. Tidak menetapkan tenggat otomatis atau membuktikan pelaporan telah diterima sistem.",
    terms: ["implementasi", "lkut", "pelaporan tahunan", "kinerja manajemen", "kinerja proyek"],
  },
  {
    id: "implementasi-pu6-pub", page: 32, title: "Panduan Pelaksanaan Pengembangan Usaha Berkelanjutan (PUB)",
    excerpt: "Paparan menjelaskan PUB umum sebagai pengembangan bersama anggota asosiasi serta PUB khusus sebagai peningkatan kinerja dan pendampingan dengan modul khusus. Materi mengacu pada Pasal 4 Permen PUPR 7/2024.",
    limitation: "Ringkasan bukan penetapan kewajiban, frekuensi, peserta atau nilai kinerja untuk BUJK tertentu. Catatan kegiatan atau sertifikat yang disimpan aplikasi tidak membuktikan penerimaan PUB oleh otoritas.",
    terms: ["implementasi", "pub", "pengembangan usaha", "pub umum", "pub khusus", "pendampingan modul"],
  },
  {
    id: "implementasi-pu6-kualifikasi", page: 57, title: "Empat Kriteria Penetapan Kualifikasi BUJK",
    excerpt: "Empat kelompok persiapan dalam paparan adalah penjualan tahunan, kemampuan keuangan, ketersediaan tenaga kerja konstruksi bersertifikat, dan kemampuan penyediaan peralatan.",
    limitation: "Tidak mengaktifkan angka ambang, perhitungan pengalaman, pemetaan SKK, atau keputusan kualifikasi. Kebutuhan per skema dan jenis permohonan memerlukan sumber primer serta telaah ahli.",
    terms: ["implementasi", "kriteria kualifikasi", "penjualan tahunan", "kemampuan keuangan", "ketersediaan tkk", "skk"],
  },
  {
    id: "implementasi-pu6-peralatan", page: 67, title: "Ketentuan Pencatatan Peralatan Konstruksi",
    excerpt: "Paparan membahas pencatatan peralatan pada SIJK terintegrasi dan menyebut status terdata sementara, terdata tetap, terdata final, dan tercatat.",
    limitation: "Istilah status pada slide bukan status verifikasi catatan lokal aplikasi. Tidak membuktikan alat terdaftar pada SIMPK/SIJK, keaslian bukti, atau adanya integrasi dengan sistem tersebut.",
    terms: ["implementasi", "pencatatan peralatan", "simpk", "terdata sementara", "terdata tetap", "terdata final"],
  },
  {
    id: "implementasi-pu6-tambahan", page: 69, title: "Kriteria Persyaratan Tambahan Penilaian Kesesuaian BUJK",
    excerpt: "Paparan mengelompokkan penerapan SMAP, keanggotaan asosiasi, dan pelaporan pemilik manfaat sebagai bahan persyaratan umum; LKUT dan PUB dibahas sebagai bahan tambahan untuk perpanjangan SBU.",
    limitation: "Pemetaan bahan persiapan bukan daftar final yang berlaku untuk semua kasus. Tidak menyatakan keanggotaan, pelaporan pemilik manfaat, SMAP, LKUT atau PUB sudah diverifikasi.",
    terms: ["implementasi", "persyaratan tambahan", "perpanjangan", "asosiasi", "pemilik manfaat", "beneficial ownership"],
  },
  {
    id: "implementasi-pu6-smap", page: 81, title: "Peluang Kepatuhan BUJK: Pemenuhan Komitmen Penerapan SMAP",
    excerpt: "Slide membahas sertifikat SMAP, pendampingan dokumen, lembaga penilaian kesesuaian dan dokumentasi audit. Judulnya menyebut ISO 37001:2025. Halaman 74 juga membahas beberapa jalur bukti atau komitmen SMAP.",
    limitation: "Penyebutan ISO 37001:2025 bukan verifikasi edisi SNI/ISO yang wajib. Tidak menyelesaikan perbedaan uraian SMAP antarsumber, menyamakan Pancek dengan sertifikasi, atau mengaktifkan tenggat komitmen pada halaman 74.",
    terms: ["implementasi", "smap", "iso 37001", "sertifikat smap", "komitmen smap", "pancek"],
  },
  {
    id: "implementasi-pu6-transisi", page: 44, title: "Ketentuan Peralihan SBU",
    excerpt: "Paparan membahas konversi SBU, perubahan data dan perpanjangan, serta mengaitkan periode konversi dengan surat pemicu. Ini adalah uraian pada materi diskusi, bukan salinan surat pemberlakuan.",
    limitation: "Tidak membuktikan surat pemicu sudah terbit, sistem siap, atau SBU tertentu tidak berlaku. Tanggal dan hitung mundur tetap ditahan sampai bukti penerbit dan telaah ahli memenuhi gerbang verifikasi yang ada.",
    terms: ["implementasi", "ketentuan peralihan", "konversi", "transisi", "surat pemicu"],
  },
] as const;

export const IMPLEMENTASI_PU6_VERSIONS: readonly ChatSourceVersion[] = [{
  sourceKey: "implementasi-permen-pu6-diskusi",
  versionId,
  baseline: true,
  citations: entries.map(e => ({
    id: `${e.id}@${versionId}`,
    document: "Materi Diskusi — Implementasi Permen PU No. 6 Tahun 2025",
    version: "Salinan unggahan 4 November 2026; 91 halaman PDF; ringkasan visual terpilih",
    locator: `PDF hlm. ${e.page} — ${e.title}`,
    excerpt: e.excerpt,
    sourceUrl: "https://jdih.pu.go.id/",
    checkedOn: "2026-11-04",
    verificationStatus: "unverified" as const,
    verificationScope: "Pemeriksaan visual halaman ringkasan terpilih pada salinan unggahan; bukan autentikasi penerbit atau telaah hukum.",
    documentStatus: "Materi diskusi; bukan peraturan atau bukti pemberlakuan operasional. Penerbit dan tanggal paparan belum terverifikasi.",
    limitation: `${e.limitation} Tautan JDIH adalah kanal rujukan regulasi, bukan URL penerbit PDF atau bukti asal paparan.`,
  })),
  keywords: Object.fromEntries(entries.map(e => [`${e.id}@${versionId}`, [...e.terms]])),
}];
