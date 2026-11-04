// Deployment-safe metadata only. Original bytes live in private App Storage.
export const KNOWLEDGE_PDFS = [
  {
    sourceKey: "teras-lpjk-12-konversi", versionId: "teras12-konversi-20261028-r1",
    sha256: "951717a952b90a13111f4b61a6e3362eb613741ba63a44921357e1cf52a250f2",
    pageCount: 20, filename: "teras-lpjk-12-materi-1.pdf",
    upload: "TERAS_LPJK_#12_Materi_1_-_Ketentuan_dan_Usulan_Konversi_SBU_Pa_1793168014141.pdf",
    pages: { "teras12-konversi-transisi": 5, "teras12-konversi-usulan": 8, "teras12-konversi-bahan": 11 },
  },
  {
    sourceKey: "teras-lpjk-12-sistem", versionId: "teras12-sistem-20261028-r1",
    sha256: "8312cddc75f75a66ebf3cf51901e46a4b191fbfd3ef61732cf8af874f0edc7f0",
    pageCount: 9, filename: "teras-lpjk-12-materi-2.pdf",
    upload: "TERAS_LPJK_#12_Materi_2_-_Kesiapan_Sistem_utk_Kepdirjen_281_RE_1793168014140.pdf",
    pages: { "teras12-sistem-prasyarat": 3, "teras12-sistem-pengujian": 5, "teras12-sistem-timeline": 8 },
  },
  {
    sourceKey: "teras-lpjk-12-pelaku-usaha", versionId: "teras12-pelaku-20261028-r1",
    sha256: "aa7beda839fa63fc804db96e436741b950e9af881f9627b8e3025e5f05610119",
    pageCount: 9, filename: "teras-lpjk-12-materi-3.pdf",
    upload: "TERAS_LPJK_#12_Materi_3_-_Perspektif_Pelaku_Usaha_Pak_Ruslan_1793168014142.pdf",
    pages: { "teras12-pelaku-jalur": 3, "teras12-pelaku-smap-pub": 6, "teras12-pelaku-pendampingan": 5 },
  },
  {
    sourceKey: "implementasi-permen-pu6-diskusi", versionId: "implementasi-pu6-20261104-r1",
    sha256: "d73f21bdf0432577b7d1daa7f1f7afc1c8a3217ef8b348cdc2f8283db4b60041",
    pageCount: 91, filename: "implementasi-permen-pu-6-materi-diskusi.pdf",
    upload: "NEW_PK-2026-1._Implementasi_Permen_PU_6_OK_1793785998101.pdf",
    // Exact allowlisted original only; not an increase to user-upload limits.
    maxBytes: 33387216,
    pages: {
      "implementasi-pu6-lkut": 25, "implementasi-pu6-pub": 32,
      "implementasi-pu6-kualifikasi": 57, "implementasi-pu6-peralatan": 67,
      "implementasi-pu6-tambahan": 69, "implementasi-pu6-smap": 81,
      "implementasi-pu6-transisi": 44,
    },
  },
  {
    sourceKey: "permen-pupr-7-2024", versionId: "pupr7-20261104-r1",
    sha256: "d2af3e4ac7b8f1b5b503ae88d4a1afb8aee76ba80989d4719dd7af3b765cd228",
    pageCount: 169, filename: "permen-pupr-7-2024-pengembangan-usaha-berkelanjutan.pdf",
    upload: "permen-pupr-no-7-tahun-2024_1793790683021.pdf",
    pages: {
      "pupr7-pub": 3, "pupr7-pub-umum": 4, "pupr7-pub-khusus": 5,
      "pupr7-lkut": 5, "pupr7-tanggung-jawab": 9, "pupr7-format-lkut": 11,
    },
  },
] as const;

// Same archived bytes, new immutable citation snapshot; no duplicate upload.
const implementationPdf = KNOWLEDGE_PDFS[3];
const EXPANDED_IMPLEMENTATION_PDF = {
  ...implementationPdf, versionId: "implementasi-pu6-20261104-r2",
  pages: {
    ...implementationPdf.pages,
    "implementasi-pu6-legalitas": 16, "implementasi-pu6-oss": 17,
    "implementasi-pu6-tkk": 62, "implementasi-pu6-skk": 63,
    "implementasi-pu6-tahapan": 73, "implementasi-pu6-jenis": 77,
  },
} as const;

export type KnowledgePdfFile = typeof KNOWLEDGE_PDFS[number] | typeof EXPANDED_IMPLEMENTATION_PDF;
export function knowledgePdf(sourceKey: string, versionId: string, citationId: string) {
  const file = [...KNOWLEDGE_PDFS, EXPANDED_IMPLEMENTATION_PDF].find(f => f.sourceKey === sourceKey && f.versionId === versionId);
  if (!file || !citationId.endsWith(`@${versionId}`)) return undefined;
  const page = (file.pages as Readonly<Record<string, number>>)[citationId.slice(0, -(versionId.length + 1))];
  if (!Number.isInteger(page) || page < 1 || page > file.pageCount) return undefined;
  return { file, metadata: { sha256: file.sha256, pageCount: file.pageCount, page, filename: file.filename } };
}
export const knowledgePdfObjectName = (file: KnowledgePdfFile) => `curated-knowledge/${file.sha256}.pdf`;
