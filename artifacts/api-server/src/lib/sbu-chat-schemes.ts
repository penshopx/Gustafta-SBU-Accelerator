import type { SbuChatCitation, SbuChatScheme } from "@workspace/api-zod";
import type { ChatSourceVersion } from "./sbu-chat-retrieval";
import { BS_SCHEME_CATALOG, BS_SOURCE_VERSIONS } from "./sbu-chat-bs-schemes";

// Bounded explanatory cards only. No assessment criteria, draft matrices,
// financial thresholds, transition dates, or private files are admitted here.
const titles = [
  "Gedung Hunian", "Gedung Perkantoran", "Gedung Industri",
  "Gedung Perbelanjaan", "Gedung Kesehatan", "Gedung Pendidikan",
  "Gedung Penginapan", "Gedung Hiburan dan Olahraga", "Gedung Lainnya",
] as const;
const scopes = [
  "Hunian, seperti rumah tinggal, rumah tinggal sementara, rumah susun, apartemen dan kondominium.",
  "Perkantoran, seperti kantor dan rumah kantor (rukan).",
  "Industri, seperti pabrik, bengkel kerja/workshop dan bangunan pabrik untuk pengelolaan dan pemrosesan bahan nuklir.",
  "Perbelanjaan, seperti gedung perdagangan/pasar/mal, toserba, toko, rumah toko (ruko) dan warung.",
  "Kesehatan, seperti rumah sakit, poliklinik, puskesmas, balai pengobatan, gedung pelayanan kesehatan dan laboratorium.",
  "Pendidikan, seperti sekolah, tempat kursus dan laboratorium.",
  "Penginapan, seperti perhotelan, hostel dan losmen.",
  "Hiburan dan olahraga, seperti bioskop, gedung kebudayaan/kesenian, wisata dan rekreasi, serta gedung olahraga.",
  "Penggunaan selain kelompok 41011–41018; contoh mencakup tempat ibadah, terminal/stasiun, gudang dan pusat data. Bukan kategori bebas untuk semua pekerjaan yang tidak dikenal.",
] as const;
export const BG_SCHEME_CATALOG = titles.map((title, i) => ({
  code: `BG${String(i + 1).padStart(3, "0")}` as SbuChatScheme,
  kbli: `4101${i + 1}`,
  title: `Konstruksi Konvensional ${title}`,
}));

const schemeVersion = "bg-scope-20261028-r1";
const kbliVersion = "kbli2025-bg-scope-20261028-r1";
const limits = "Ringkasan penjelasan ruang lingkup saja; bukan persyaratan numerik, keputusan kelayakan, autentikasi dokumen atau konfirmasi penerapan OSS. Tidak mengaktifkan draf penilaian BG001. Tautan hanya kanal rujukan, bukan tautan PDF unggahan.";
export const BG_SOURCE_VERSIONS: readonly ChatSourceVersion[] = [
  {
    sourceKey: "pilot-bg-institutional-scope", versionId: schemeVersion, baseline: true,
    keywords: {},
    citations: BG_SCHEME_CATALOG.map((row, i): SbuChatCitation => ({
      id: `${row.code.toLowerCase()}-mapping@${schemeVersion}`,
      document: "Skema Bangunan Gedung — LSBU Konstruksi Indonesia",
      version: `SSBG.1.LSBU-KI; 01/11; review tercetak 21.09.2026; SHA-256 d457e9c533e7c2aa1a84cea9bfc3007e5795cc14ad079a80411217d0677cc7d5`,
      locator: `Bagian 2.1.5, baris ${row.code}; PDF hlm. ${i < 5 ? 21 : 22}, cetak ${i < 5 ? 7 : 8}`,
      excerpt: `Salinan skema memasangkan ${row.code} dengan KBLI ${row.kbli}, ${row.title}. Ini skema lembaga, bukan bukti ketentuan universal semua LSBU.`,
      sourceUrl: "https://binakonstruksi.pu.go.id/",
      verificationStatus: "unverified", checkedOn: "2026-10-28",
      verificationScope: "Pencocokan terarah kode dan judul pada salinan unggahan; bukan autentikasi penerbit.",
      documentStatus: "Skema institusional; keaslian dan penerapan terkini belum terverifikasi.",
      limitation: `${limits} Tautan Bina Konstruksi adalah kanal pembina, bukan situs penerbit skema LSBU Konstruksi Indonesia.`,
    })),
  },
  {
    sourceKey: "pilot-bg-kbli2025-scope", versionId: kbliVersion, baseline: true,
    keywords: {},
    citations: BG_SCHEME_CATALOG.map((row, i): SbuChatCitation => ({
      id: `${row.code.toLowerCase()}-scope@${kbliVersion}`,
      document: "Klasifikasi Baku Lapangan Usaha Indonesia 2025 — BPS",
      version: "KBLI 2025, salinan unggahan; SHA-256 169ec324af12c3e535d081dbe3789e019f9131ab81460357c2453fd0651a56b3",
      locator: `Kelompok ${row.kbli}; PDF hlm. ${i < 4 ? "573" : i === 8 ? "574–575" : "574"}, cetak ${i < 4 ? "557" : i === 8 ? "558–559" : "558"}`,
      excerpt: `${row.kbli}: ${row.title}. Kegiatan pembangunan, pemeliharaan dan/atau pembangunan kembali dengan metode konvensional, serta perubahan dan renovasi. ${scopes[i]}`,
      sourceUrl: "https://www.bps.go.id/",
      verificationStatus: "unverified", checkedOn: "2026-10-28",
      verificationScope: "Ringkasan terbatas teks salinan KBLI 2025; bukan validasi perizinan atau pengesahan pemetaan SBU.",
      documentStatus: "Referensi klasifikasi kegiatan ekonomi; penerapan sertifikasi belum terverifikasi.",
      limitation: `${limits} Tidak menyamakan uraian KBLI lama dan baru atau menetapkan aturan transisi. Buku lengkap tidak didistribusikan ulang.`,
    })),
  },
];

export function schemeSources(scheme: SbuChatScheme, versions: readonly ChatSourceVersion[]) {
  const prefix = `${scheme.toLowerCase()}-`;
  return versions.filter(v => [...BG_SOURCE_VERSIONS, ...BS_SOURCE_VERSIONS].some(p => p.sourceKey === v.sourceKey))
    .flatMap(v => v.citations.filter(c => c.id.startsWith(prefix))).map(c => ({ ...c }));
}

export function schemeInstruction(scheme?: SbuChatScheme) {
  if (!scheme) return "";
  const row = [...BG_SCHEME_CATALOG, ...BS_SCHEME_CATALOG].find(r => r.code === scheme);
  if (!row) throw new Error("invalid_scheme");
  return `\nPAKAR SKEMA SBU — PILOT ${scheme.slice(0, 2)}: konteks pilihan server ${row.code}, ${row.title}, KBLI ${row.kbli}.
Sumber pilot hanya ringkasan pemetaan dan ruang lingkup, bukan dokumen lengkap. Jangan mengaku membaca seluruh PDF.
Jawab hanya dalam konteks ini. Pertanyaan subklasifikasi lain: minta pengguna mengganti pilihan; jangan membawa sumber percakapan lama.
Untuk pertanyaan persyaratan, kualifikasi, jenis BUJK, permohonan baru/perpanjangan: tanyakan konteks yang kurang dan katakan bahwa dasar persyaratan spesifik belum tersedia dalam pilot ini. Jangan mengarang angka, SKK, alat atau pengalaman.
Susun: jawaban langsung; dasar dokumen dengan penanda kutipan; penjelasan sesuai peran; batas verifikasi; langkah/pertanyaan berikutnya.
Jika sumber untuk ruang lingkup pun tidak tersedia, jangan jawab dari ingatan. Pisahkan bunyi sumber, penjelasan dan informasi yang belum diketahui.
Pemilihan mode bukan kewenangan peninjau/asesor resmi. Tidak mengesahkan berkas atau mengubah penilaian.`;
}
