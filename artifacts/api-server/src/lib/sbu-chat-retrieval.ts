import type { SbuChatCitation } from "@workspace/api-zod";

export const RETRIEVAL_NOTICE = "Pencarian lokal pada ringkasan sumber publik terkurasi, bukan dokumen lengkap atau verifikasi live. Nomor halaman merujuk PDF yang ditelaah. Draf BG001 tidak digunakan; status terkini dan penerapan harus dikonfirmasi.";

// Only the preparation references documented in docs/regulatory-basis.md are
// admitted here. Candidate matrices in *-draft.md / sbu-requirements-review.md
// are deliberately NOT indexed. No user files, URLs, or database are searched.
const permenUrl = "https://jdih.pu.go.id/detail-dokumen/PermenPU-nomor-6-tahun-2025-Standar-Kegiatan-Usaha-danatau-Standar-ProdukJasa-Pelaksanaan-Pengawasan-dan-Pengenaan-Sanksi-pada-Penyelenggaraan-Perizinan-Berusaha-Berbasis-Risiko-Sektor-Pekerjaan-Umum";
const permen = {
  document: "Permen PU Nomor 6 Tahun 2025",
  version: "Nomor 6 Tahun 2025; ringkasan persiapan, pemeriksaan 26 September 2026",
  sourceUrl: permenUrl,
  checkedOn: "2026-09-26",
};
const CORPUS: readonly SbuChatCitation[] = [
  {
    ...permen, id: "pu6-metadata", locator: "Metadata JDIH PU — kolom status dokumen",
    excerpt: "Metadata JDIH PU mencantumkan status Berlaku pada pemeriksaan yang terdokumentasi.",
    verificationStatus: "verified", verificationScope: "Metadata penerbit pada tanggal pemeriksaan saja.",
    documentStatus: "Berlaku menurut metadata JDIH pada 26 September 2026; bukan konfirmasi terkini.",
    limitation: "Tidak memverifikasi seluruh isi salinan, perubahan sesudah pemeriksaan, surat Pasal 20 ayat (2), kesiapan SIJK, atau persyaratan BG001.",
  },
  {
    ...permen, id: "pu6-smap", locator: "Lampiran I — PDF hlm. 266",
    excerpt: "Ringkasan persiapan mencatat alternatif bukti SMAP; surat komitmen terkait kondisi permohonan SBU pertama kali. Pilihan permohonan baru tidak membuktikan kondisi pertama kali.",
    verificationStatus: "unverified", verificationScope: "Ringkasan salinan yang ditelaah untuk panduan persiapan.",
    documentStatus: "Status penerapan pada permohonan belum terverifikasi.",
    limitation: "Bukan autentikasi salinan atau telaah ahli penerapan. Jangan menetapkan jalur bukti tunggal, tenggat, atau kelayakan dari ringkasan ini.",
  },
  {
    ...permen, id: "pu6-transisi", locator: "Pasal 20–21 — PDF hlm. 12–13",
    excerpt: "Pemicu konversi SBU eksisting adalah surat Pasal 20 ayat (2), bukan tanggal Kepdirjen. Pengecualian penggunaan SBU lama pada Pasal 21 ayat (7) memerlukan telaah.",
    verificationStatus: "unverified", verificationScope: "Ringkasan teks salinan; bukan verifikasi surat pemicu atau operasional.",
    documentStatus: "Surat pemicu dan penerapan transisi belum terverifikasi; tidak membuktikan surat belum terbit.",
    limitation: "Jangan menampilkan tanggal/hitung mundur. Bukti penerbit dan telaah ahli yang sah belum tersedia dalam korpus.",
  },
  {
    id: "dk281-skema", document: "Kepdirjen Bina Konstruksi 281/KPTS/DK/2026",
    version: "281/KPTS/DK/2026; ringkasan persiapan, pemeriksaan 26 September 2026",
    locator: "Surat pengantar PDF hlm. 1; diktum KEEMPAT–KELIMA hlm. 4; skema SMAP hlm. 27–32",
    excerpt: "Ringkasan salinan mencatat penggantian Kepdirjen 37/2025 dan pilihan bukti SMAP. Penyesuaian skema LSBU berbeda dari pemberlakuan operasional yang menunggu penyesuaian SIJK dan surat Pasal 20 ayat (2).",
    sourceUrl: "https://binakonstruksi.pu.go.id/",
    verificationStatus: "unverified", verificationScope: "Ringkasan salinan unggahan; tautan adalah kanal penerbit, bukan salinan keputusan terautentikasi.",
    documentStatus: "Keaslian/status mutakhir belum dikonfirmasi penerbit.",
    checkedOn: "2026-09-26",
    limitation: "Bukan aturan operasional terverifikasi atau persetujuan matriks BG001. Tidak mengaktifkan draf, angka persyaratan, atau tenggat.",
  },
];

const keywords: Record<string, readonly string[]> = {
  "pu6-metadata": ["permen", "regulasi", "aturan", "berlaku", "status", "jdih", "sumber", "6/2025"],
  "pu6-smap": ["smap", "pancek", "komitmen", "pertama", "anti", "penyuapan"],
  "pu6-transisi": ["transisi", "konversi", "sijk", "tenggat", "surat", "pasal 20", "pasal 21"],
  "dk281-skema": ["kepdirjen", "281", "skema", "lsbu", "smap", "sijk"],
};

export function retrieveChatSources(question: string): SbuChatCitation[] {
  const normalized = question.toLocaleLowerCase("id");
  return CORPUS.map(source => ({
    source, score: keywords[source.id].filter(term => normalized.includes(term)).length,
  })).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4).map(item => ({ ...item.source }));
}

// The model supplies IDs only. Titles, locators, URLs, excerpts and verification
// claims always come from the server's retrieved set, never from the model.
export function validateCitedAnswer(raw: string, sources: readonly SbuChatCitation[]) {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("invalid_cited_answer");
  const data = value as Record<string, unknown>;
  if (typeof data.answer !== "string" || !data.answer.trim() || data.answer.length > 12000 ||
      !Array.isArray(data.citationIds) || data.citationIds.some(id => typeof id !== "string")) {
    throw new Error("invalid_cited_answer");
  }
  const answer = data.answer;
  const ids = [...new Set(data.citationIds as string[])];
  const citations = ids.map(id => {
    const source = sources.find(item => item.id === id);
    if (!source) throw new Error("citation_not_retrieved");
    if (!answer.includes(`[${id}]`)) throw new Error("citation_not_attached");
    return source;
  });
  // Reject fabricated inline citation markers as well as unknown envelope IDs.
  for (const match of answer.matchAll(/\[([^\]\n]+)\]/g)) {
    if (!ids.includes(match[1])) throw new Error("citation_not_retrieved");
  }
  // Legal references are only rendered in the server-owned citation cards.
  // Do not let model-invented URLs masquerade as traceable sources in prose.
  if (/https?:\/\/|www\./i.test(answer)) throw new Error("model_source_url");
  return { answer: answer.trim(), citations };
}
