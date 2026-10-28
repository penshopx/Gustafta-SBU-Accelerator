import type { SbuChatCitation } from "@workspace/api-zod";
import type { ChatSourceVersion } from "./sbu-chat-retrieval";

// Editorial admission of bounded uploaded presentation summaries, not approval
// of legal validity, live systems, proposed dates or assessment requirements.
// Original-file identities and page checks: docs/knowledge-intake-teras-lpjk.md.
const common = {
  sourceUrl: "https://lpjk.pu.go.id/",
  checkedOn: "2026-10-28",
  verificationStatus: "unverified" as const,
  verificationScope: "Kurasi teks salinan unggahan dan pemeriksaan visual halaman terpilih; bukan autentikasi penerbit atau verifikasi live.",
  documentStatus: "Materi paparan TERAS LPJK Episode 12; bukan peraturan atau bukti pemberlakuan operasional.",
};

function source(
  sourceKey: string, versionId: string, document: string, version: string,
  entries: readonly { id: string; locator: string; excerpt: string; limitation: string; terms: string[] }[],
): ChatSourceVersion {
  return {
    sourceKey, versionId, baseline: true,
    citations: entries.map(({ id, locator, excerpt, limitation }): SbuChatCitation => ({
      ...common, id: `${id}@${versionId}`, document, version, locator, excerpt,
      limitation: `${limitation} Tautan adalah kanal LPJK, bukan tautan PDF unggahan atau bukti keaslian salinan.`,
    })),
    keywords: Object.fromEntries(entries.map(e => [`${e.id}@${versionId}`, e.terms])),
  };
}

export const TERAS_LPJK_VERSIONS: readonly ChatSourceVersion[] = [
  source("teras-lpjk-12-konversi", "teras12-konversi-20261028-r1",
    "TERAS LPJK #12 — Peraturan Konversi SBU — Sigit Anjar",
    "Materi 1; sampul Jakarta, 9 September 2026; kurasi salinan 28 Oktober 2026", [
      {
        id: "teras12-konversi-transisi", locator: "PDF hlm. 5–7 — SBU existing, timeline konversi, dan Pasal 21 ayat (7)",
        excerpt: "Paparan membedakan penetapan skema, kesiapan SIJK terintegrasi, surat pemberlakuan, serta penggunaan SBU existing untuk pemilihan dan pelaksanaan kontrak. Jadwal pada paparan bukan bukti bahwa surat pemicu sudah terbit.",
        limitation: "Tanggal dan hitung mundur konversi tetap ditahan sampai ada bukti penerbit yang memenuhi syarat. Tidak menyimpulkan surat belum terbit atau SBU tertentu masih sah.",
        terms: ["teras", "materi 1", "sigit", "ketentuan konversi", "timeline konversi", "sbu existing"],
      },
      {
        id: "teras12-konversi-usulan", locator: "PDF hlm. 8–9 — Usulan Mekanisme Konversi dan Persiapan Konversi",
        excerpt: "Bagian berjudul Usulan Mekanisme Konversi membahas perubahan data tanpa asesmen ulang, tanpa biaya, serta penerbitan otomatis. Persiapan mencakup pemeriksaan SBU existing, simulasi kemampuan usaha, pencatatan pengalaman di SIMPAN, dan pemantauan informasi.",
        limitation: "Tanpa biaya dan otomatis adalah uraian usulan dalam paparan, bukan jaminan layanan aktif, tarif resmi, atau hak atas konversi. Bukan pengajuan atau integrasi SIMPAN.",
        terms: ["teras", "materi 1", "sigit", "usulan", "otomatis", "tanpa biaya", "persiapan konversi"],
      },
      {
        id: "teras12-konversi-bahan", locator: "PDF hlm. 11–19 — Kriteria, ketentuan lainnya, dan tahapan permohonan",
        excerpt: "Paparan membahas kelompok bahan persiapan: pengalaman dan penjualan tahunan, kemampuan keuangan, tenaga kerja/SKK, peralatan, penerapan SMAP, keanggotaan asosiasi, pelaporan pemilik manfaat, serta LKUT dan PUB untuk perpanjangan. Penjelasan bukti SMAP berada pada PDF halaman 16.",
        limitation: "Ringkasan bukan matriks angka atau keputusan kelayakan. Uraian SMAP perlu disandingkan dengan materi 3 PDF halaman 6 yang memuat pandangan berbeda tentang dokumen buatan BUJK; jangan memilih satu jalur bukti tanpa telaah sumber primer dan ahli.",
        terms: ["teras", "materi 1", "sigit", "bahan persiapan", "pemilik manfaat", "lkut", "pub", "syarat lainnya"],
      },
    ]),
  source("teras-lpjk-12-sistem", "teras12-sistem-20261028-r1",
    "TERAS LPJK #12 — Kesiapan Sistem Informasi — Hambali",
    "Materi 2; sampul tahun 2026, tanpa tanggal harian; kurasi salinan 28 Oktober 2026", [
      {
        id: "teras12-sistem-prasyarat", locator: "PDF hlm. 3–4 — Dasar hukum dan pengelolaan sistem informasi",
        excerpt: "Paparan mengaitkan sertifikasi dengan kesiapan SIJK terintegrasi dan surat pemberlakuan, serta membedakan penyesuaian skema LSBU dari konversi SBU. OSS, AHU, perizinan PU, SIKI, SIMPAN, SIMPK, dan AUJK disebut sebagai ekosistem sistem terkait.",
        limitation: "Peta keterkaitan sistem bukan bukti sistem sudah siap, koneksi aplikasi ini ke sistem tersebut, atau surat pemberlakuan yang terautentikasi. Tidak menetapkan tanggal operasional.",
        terms: ["teras", "materi 2", "hambali", "kesiapan sistem", "ekosistem sistem", "sijk terintegrasi"],
      },
      {
        id: "teras12-sistem-pengujian", locator: "PDF hlm. 5–7 — Rencana pengujian, infrastruktur, dan prasyarat kesiapan",
        excerpt: "Rencana penyiapan mencakup proses bisnis, pengembangan modul, uji internal, keamanan dan beban layanan, UAT bersama LSBU, SOP, pelatihan, serta sosialisasi. Paparan menyebut perlunya ketiadaan temuan kritis, infrastruktur andal, kesiapan pemangku kepentingan, dan mekanisme transisi.",
        limitation: "Daftar rencana dan prasyarat bukan laporan hasil uji yang telah lulus, bukti kapasitas layanan terkini, atau kepastian tanggal peluncuran.",
        terms: ["teras", "materi 2", "hambali", "kesiapan sistem", "uat", "infrastruktur", "pengujian sistem"],
      },
      {
        id: "teras12-sistem-timeline", locator: "PDF hlm. 8 — Tahapan Implementasi Sesuai Usulan Timeline",
        excerpt: "Diagram secara eksplisit berjudul usulan timeline: penetapan skema, pemenuhan prasyarat kesiapan, surat pemberlakuan, pelaksanaan konversi dan pendampingan, kemudian pemberlakuan penuh. Diagram adalah paparan rencana, bukan surat pemicu.",
        limitation: "Tanggal pada diagram usulan tidak boleh dipromosikan menjadi tanggal konversi resmi atau hitung mundur. Memerlukan surat penerbit yang sah dan pemeriksaan operasional terpisah.",
        terms: ["teras", "materi 2", "hambali", "usulan timeline", "peta jalan", "roadmap"],
      },
    ]),
  source("teras-lpjk-12-pelaku-usaha", "teras12-pelaku-20261028-r1",
    "TERAS LPJK #12 — Perspektif Pelaku Usaha dalam Implementasi Konversi / Sertifikasi SBU — Ruslan Rivai",
    "Materi 3; sampul 9 September 2026; 9 halaman PDF, penomoran slide tidak berurutan; kurasi 28 Oktober 2026", [
      {
        id: "teras12-pelaku-jalur", locator: "PDF hlm. 3–4 — slide 03/10 dan 04/10, jalur konversi dan sertifikasi",
        excerpt: "Pemateri membedakan jalur konversi dari sertifikasi baru/perpanjangan dan menekankan persiapan aktif BUJK. Data beban layanan dinyatakan sebagai proyeksi berbasis asumsi jadwal yang perlu dikonfirmasi silang.",
        limitation: "Perspektif pemateri bukan penetapan jalur untuk kasus tertentu. Proyeksi tidak boleh dipakai sebagai statistik mutakhir, tarif resmi, atau bukti kesiapan sistem.",
        terms: ["teras", "materi 3", "ruslan", "perspektif", "pelaku usaha", "proyeksi", "jalur konversi"],
      },
      {
        id: "teras12-pelaku-smap-pub", locator: "PDF hlm. 6–7 — slide 07/10 dan 08/10, lima aspek penilaian dan PUB",
        excerpt: "Paparan membahas keuangan, penjualan tahunan/e-SIMPAN, tenaga kerja, peralatan, SMAP, pemilik manfaat, LKUT dan kepesertaan PUB. Pada SMAP, pemateri menulis tanpa opsi dokumen dibuat BUJK. Ini harus dibedakan dari alternatif bukti pada materi 1 PDF halaman 16 dan ringkasan sumber primer yang ada.",
        limitation: "Perbedaan uraian SMAP belum diselesaikan. Jangan meniadakan alternatif bukti dari sumber primer atau menetapkan kewajiban tunggal berdasarkan opini paparan. Angka PUB merupakan proyeksi, bukan statistik terkini yang diverifikasi.",
        terms: ["teras", "materi 3", "ruslan", "perspektif", "pelaku usaha", "dokumen smap", "bukti smap", "pub", "lkut", "e-simpan"],
      },
      {
        id: "teras12-pelaku-pendampingan", locator: "PDF hlm. 5, 8–9 — slide 05/10, 09/10 dan 10/10, tata kelola dan masukan strategis",
        excerpt: "Masukan pelaku usaha meliputi keseragaman layanan, pengurangan permintaan dokumen berulang, jalur eskalasi kendala sistem, sosialisasi, percepatan PUB oleh asosiasi, pendampingan anggota, dan mekanisme check and balance.",
        limitation: "Rekomendasi pembicara bukan temuan audit yang dibuktikan atau ketentuan hukum baru. Tidak menyimpulkan konflik kepentingan atau pelanggaran oleh lembaga tertentu sebagai fakta terverifikasi.",
        terms: ["teras", "materi 3", "ruslan", "perspektif", "pelaku usaha", "pendampingan", "tata kelola", "asosiasi", "eskalasi"],
      },
    ]),
];
