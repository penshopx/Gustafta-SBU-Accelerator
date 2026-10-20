import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, casesTable, documentsTable, documentAnalysesTable } from "@workspace/db";
import { GetConsultationAnalysisPreviewResponse, AnalyzeCaseDocumentResponse } from "@workspace/api-zod";

export const MAX_CONSULTATION_CONTEXT = 8000;
export class ConsultationSourceError extends Error {
  constructor(public status: 404 | 409) { super("consultation_source_unavailable"); }
}

// Metadata/results only. Never resolve storage paths, download bytes or read profiles.
export async function consultationAnalysis(caseId: number, documentId: string, analysisId: string, ownerId: string) {
  const [row] = await db.select({ document: documentsTable, analysis: documentAnalysesTable })
    .from(documentAnalysesTable)
    .innerJoin(documentsTable, eq(documentsTable.id, documentAnalysesTable.documentId))
    .innerJoin(casesTable, eq(casesTable.id, documentsTable.caseId))
    .where(and(eq(casesTable.id, caseId), eq(casesTable.ownerId, ownerId),
      eq(documentsTable.id, documentId), eq(documentsTable.caseId, caseId), eq(documentsTable.ownerId, ownerId),
      eq(documentsTable.status, "ready"), eq(documentsTable.scanStatus, "clean"),
      eq(documentAnalysesTable.id, analysisId), eq(documentAnalysesTable.caseId, caseId),
      eq(documentAnalysesTable.ownerId, ownerId))).limit(1);
  if (!row) throw new ConsultationSourceError(404);
  const { document, analysis } = row;
  if (!document.scanGeneration || analysis.sourceVersion !== document.version || !analysis.sourcePages?.length) {
    throw new ConsultationSourceError(409);
  }
  const parsed = AnalyzeCaseDocumentResponse.shape.result.safeParse(analysis.result);
  if (!parsed.success) throw new ConsultationSourceError(409);
  const r = parsed.data;
  const text = [
    `Ringkasan\n${r.summary}`,
    `Informasi terbaca\n${r.extracted.map(x => `${x.label}: ${x.value} (${x.location})`).join("\n")}`,
    `Catatan perhatian\n${r.concerns.join("\n")}`,
    `Informasi belum tersedia\n${r.missingInformation.join("\n")}`,
    `Langkah berikut\n${r.nextSteps.join("\n")}`,
  ].join("\n\n");
  if (text.length > 60000) throw new ConsultationSourceError(409);
  const source = {
    caseId, documentId, analysisId, sourceVersion: analysis.sourceVersion,
    sourcePages: analysis.sourcePages, model: analysis.model, focus: analysis.focus,
    createdAt: analysis.createdAt.toISOString(),
  };
  const revision = createHash("sha256").update(JSON.stringify([source, document.scanGeneration, text])).digest("hex");
  return GetConsultationAnalysisPreviewResponse.parse({ ...source, revision, text });
}

export function sourceErrorMessage() {
  return "Sumber Bedah Dokumen hilang, tidak tersedia, atau berubah. Buat konsultasi baru dan tinjau ulang pilihan sumber; snapshot lama tetap tersimpan.";
}
