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
] as const;

export type KnowledgePdfFile = typeof KNOWLEDGE_PDFS[number];
export function knowledgePdf(sourceKey: string, versionId: string, citationId: string) {
  const file = KNOWLEDGE_PDFS.find(f => f.sourceKey === sourceKey && f.versionId === versionId);
  if (!file || !citationId.endsWith(`@${versionId}`)) return undefined;
  const page = (file.pages as Readonly<Record<string, number>>)[citationId.slice(0, -(versionId.length + 1))];
  if (!Number.isInteger(page) || page < 1 || page > file.pageCount) return undefined;
  return { file, metadata: { sha256: file.sha256, pageCount: file.pageCount, page, filename: file.filename } };
}
export const knowledgePdfObjectName = (file: KnowledgePdfFile) => `curated-knowledge/${file.sha256}.pdf`;
