import type { SbuChatCitation, SbuChatScheme } from "@workspace/api-zod";
import type { ChatSourceVersion } from "./sbu-chat-retrieval";

type BsEntry = {
  code: SbuChatScheme; kbli: string; title: string;
  pdf: string; printed: string; scope: string;
};
// Explicit mapping, not a sequential KBLI calculation. In particular BS017
// precedes BS018/19 despite its larger KBLI, and BS020 is a utilities category.
export const BS_SCHEME_CATALOG: readonly BsEntry[] = [
  { code: "BS001", kbli: "42101", title: "Konstruksi Jalan Pada Permukaan Tanah", pdf: "576", printed: "560",
    scope: "Jalan pada permukaan tanah, termasuk jalan raya, landasan terbang dan lapangan penyimpanan peti kemas; dapat disertai pagar atau tembok penahan jalan." },
  { code: "BS002", kbli: "42102", title: "Konstruksi Bangunan Sipil Jembatan, Jalan Layang, Fly Over, dan Underpass", pdf: "576", printed: "560",
    scope: "Jembatan termasuk jembatan rel, jalan layang, fly over dan underpass, beserta pekerjaan penunjang yang disebut dalam kelompok ini." },
  { code: "BS003", kbli: "42103", title: "Konstruksi Jalan Rel", pdf: "576", printed: "560",
    scope: "Jalan rel dan pekerjaan terkait pemasangan rel, bantalan dan kerikil badan jalan kereta api. Uraian ini tidak mencakup konstruksi jembatan rel." },
  { code: "BS004", kbli: "42201", title: "Konstruksi Jaringan Irigasi dan Drainase", pdf: "577", printed: "561",
    scope: "Pembangunan, pemeliharaan dan/atau pembangunan kembali jaringan saluran air irigasi dan jaringan drainase." },
  { code: "BS005", kbli: "42202", title: "Konstruksi Bangunan Sipil Pengolahan Air Bersih", pdf: "577–578", printed: "561–562",
    scope: "Bangunan penyadap, penyalur dan pengolahan air baku atau air minum; menara, reservoir, jaringan distribusi, tangki dan bangunan pelengkap air minum." },
  { code: "BS006", kbli: "42203", title: "Konstruksi Bangunan Sipil Sistem Pengolahan Limbah", pdf: "578", printed: "562",
    scope: "Sarana pengolahan limbah padat, cair dan gas, termasuk reservoir dan perpipaan limbah, jaringan air limbah, sarana pembuangan/pembakaran serta konstruksi sistem septik." },
  { code: "BS007", kbli: "42204", title: "Konstruksi Bangunan Sipil Elektrikal", pdf: "578", printed: "562",
    scope: "Bangunan sipil pembangkit, transmisi, distribusi dan pemanfaatan tenaga listrik; ladang energi surya/angin, jaringan pipa listrik, gardu induk serta tiang dan menara." },
  { code: "BS008", kbli: "42205", title: "Konstruksi Bangunan Sipil Telekomunikasi Untuk Prasarana Transportasi", pdf: "578", printed: "562",
    scope: "Bangunan fasilitas telekomunikasi untuk navigasi laut/udara serta sinyal dan telekomunikasi kereta api, termasuk menara, tiang, antena dan stasiun bumi terkait." },
  { code: "BS009", kbli: "42206", title: "Konstruksi Sentral Telekomunikasi", pdf: "578", printed: "562",
    scope: "Pembangunan, pemeliharaan dan perbaikan bangunan sentral telekomunikasi dan perlengkapannya; termasuk jaringan pipa, transmisi dan distribusi kabel telekomunikasi lokal/jarak jauh." },
  { code: "BS010", kbli: "42911", title: "Konstruksi Bangunan Prasarana Sumber Daya Air", pdf: "579", printed: "563",
    scope: "Prasarana sumber daya air seperti bendungan, bendung, embung, pintu air, saluran pengendali banjir, waduk, bangunan pengambilan dan stasiun pompa." },
  { code: "BS011", kbli: "42912", title: "Konstruksi Bangunan Pelabuhan Bukan Perikanan", pdf: "579–580", printed: "563–564",
    scope: "Dermaga, trestle dan prasarana pelabuhan bukan perikanan; mencakup pekerjaan pengerukan/normalisasi yang dijelaskan pada uraian serta bangunan pendukung seperti terminal khusus." },
  { code: "BS012", kbli: "42913", title: "Konstruksi Bangunan Pelabuhan Perikanan", pdf: "580", printed: "564",
    scope: "Dermaga, trestle dan sarana pelabuhan perikanan; uraian juga menyebut jalan air/terusan, sarana jalur sungai, dok dan lock." },
  { code: "BS013", kbli: "42991", title: "Konstruksi Bangunan Sipil Minyak dan Gas Bumi", pdf: "581", printed: "565",
    scope: "Bangunan sipil pada kegiatan hulu/hilir minyak dan gas di atas tanah, bawah tanah atau dalam air; contohnya pipa angkutan jarak jauh dan anjungan lepas pantai." },
  { code: "BS014", kbli: "42992", title: "Konstruksi Bangunan Sipil Pertambangan", pdf: "581", printed: "565",
    scope: "Fasilitas eksplorasi dan operasi produksi pertambangan, termasuk pengendalian dampak lingkungan." },
  { code: "BS015", kbli: "42993", title: "Konstruksi Bangunan Sipil Panas Bumi", pdf: "581", printed: "565",
    scope: "Fasilitas hulu dan hilir panas bumi, seperti sumur, fasilitas lapangan uap dan pipa penyalur." },
  { code: "BS016", kbli: "42994", title: "Konstruksi Bangunan Sipil Fasilitas Olahraga", pdf: "581", printed: "565",
    scope: "Fasilitas olahraga seperti stadion, lapangan olahraga, lapangan golf, kolam renang, lintasan atletik dan gelanggang olahraga." },
  { code: "BS017", kbli: "42999", title: "Konstruksi Bangunan Sipil Lainnya YTDL", pdf: "582", printed: "566",
    scope: "Bangunan sipil lainnya, misalnya lapangan parkir, taman bermain dan sarana lingkungan permukiman di luar gedung, serta pembagian lahan dengan pengembangan prasarana. Bukan kategori bebas untuk semua pekerjaan." },
  { code: "BS018", kbli: "42995", title: "Konstruksi Bangunan Sipil Fasilitas Pengolahan", pdf: "581–582", printed: "565–566",
    scope: "Fasilitas sipil pengolahan seperti kimia, pupuk, plastik, karet, farmasi/petrokimia, mikroelektronika, tekstil dan besi/baja. Secara eksplisit tidak mencakup fasilitas pengolahan dengan sumber radiasi pengion (42997)." },
  { code: "BS019", kbli: "42996", title: "Konstruksi Bangunan Sipil Fasilitas Militer dan Bandar Antariksa", pdf: "582", printed: "566",
    scope: "Konstruksi fasilitas militer seperti benteng, lubang perlindungan dan pusat pengujian militer, termasuk fasilitas bandar antariksa." },
  { code: "BS020", kbli: "42209", title: "Konstruksi Proyek Utilitas Lainnya", pdf: "579", printed: "563",
    scope: "Konstruksi utilitas yang belum tercakup pada kelompok 42201–42207, termasuk penataan bangunan dan lingkungan serta prasarana kawasan permukiman, industri atau rumah sakit." },
];

const schemeVersion = "bs-scope-20261028-r1";
const kbliVersion = "kbli2025-bs-scope-20261028-r1";
const limitation = "Ringkasan pemetaan dan ruang lingkup saja; bukan persyaratan numerik, autentikasi dokumen, keputusan sertifikasi atau konfirmasi penerapan OSS. Tidak mengaktifkan aturan penilaian atau transisi KBLI. Tautan hanya kanal rujukan, bukan PDF unggahan.";

export const BS_SOURCE_VERSIONS: readonly ChatSourceVersion[] = [
  {
    sourceKey: "pilot-bs-institutional-scope", versionId: schemeVersion, baseline: true, keywords: {},
    citations: BS_SCHEME_CATALOG.map((row, i): SbuChatCitation => {
      const page = i < 5 ? 21 : i < 18 ? 22 : 23;
      return {
        id: `${row.code.toLowerCase()}-mapping@${schemeVersion}`,
        document: "Skema Bangunan Sipil — LSBU Konstruksi Indonesia",
        version: "SSBS.2.LSBU-KI; 01/11; review tercetak 21.09.2026; SHA-256 4606ae2833ef52943064dec15de442fd2d92963b7c2dc86f1cf1713c6615e008",
        locator: `Bagian 2.1.5, baris ${row.code}; PDF hlm. ${page}, cetak ${page - 14}`,
        excerpt: `Salinan skema memasangkan ${row.code} dengan KBLI ${row.kbli}, ${row.title}. Ini skema lembaga, bukan bukti ketentuan universal semua LSBU.`,
        sourceUrl: "https://binakonstruksi.pu.go.id/",
        verificationStatus: "unverified", checkedOn: "2026-10-28",
        verificationScope: "Pencocokan terarah kode dan judul pada salinan unggahan; bukan autentikasi penerbit.",
        documentStatus: "Skema institusional; keaslian dan penerapan terkini belum terverifikasi.",
        limitation: `${limitation} Kanal Bina Konstruksi adalah kanal pembina, bukan situs penerbit skema LSBU Konstruksi Indonesia. Catatan KBLI 2020/2025 pada skema tidak dijadikan aturan transisi operasional.`,
      };
    }),
  },
  {
    sourceKey: "pilot-bs-kbli2025-scope", versionId: kbliVersion, baseline: true, keywords: {},
    citations: BS_SCHEME_CATALOG.map((row): SbuChatCitation => ({
      id: `${row.code.toLowerCase()}-scope@${kbliVersion}`,
      document: "Klasifikasi Baku Lapangan Usaha Indonesia 2025 — BPS",
      version: "KBLI 2025, salinan unggahan; SHA-256 169ec324af12c3e535d081dbe3789e019f9131ab81460357c2453fd0651a56b3",
      locator: `Kelompok ${row.kbli}; PDF hlm. ${row.pdf}, cetak ${row.printed}`,
      excerpt: `${row.kbli}: ${row.title}. Ringkasan ruang lingkup: ${row.scope}`,
      sourceUrl: "https://www.bps.go.id/",
      verificationStatus: "unverified", checkedOn: "2026-10-28",
      verificationScope: "Ringkasan terbatas salinan KBLI 2025; bukan pengesahan pemetaan SBU, izin usaha atau pelaksanaan sertifikasi.",
      documentStatus: "Referensi klasifikasi kegiatan ekonomi; penerapan sertifikasi belum terverifikasi.",
      limitation: `${limitation} KBLI yang ada di buku tetapi tidak ada pada tabel BS unggahan tidak dipasangkan ke SBU baru secara otomatis. Buku lengkap tidak didistribusikan ulang.`,
    })),
  },
];
