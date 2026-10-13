import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, casesTable, documentsTable, documentAnalysesTable } from "@workspace/db";
import {
  ListDocumentAnalysesParams, ListDocumentAnalysesResponse, AnalyzeCaseDocumentParams,
  AnalyzeCaseDocumentBody, AnalyzeCaseDocumentResponse, DeleteDocumentAnalysisParams,
  type DocumentAnalysisInput, type DocumentAnalysisResult,
} from "@workspace/api-zod";
import { documentStorage } from "../lib/document-storage";
import { ANALYSIS_DISCLAIMER, ANALYSIS_MODEL, AnalysisFormatError, MAX_ANALYSIS_BYTES, analyzeDocumentBytes } from "../lib/document-analysis";

type Generate = (bytes: Buffer, contentType: string, input: DocumentAnalysisInput, signal: AbortSignal) => Promise<DocumentAnalysisResult>;
// Real SBU auth + immutable form owner middleware must precede this router.
export function createDocumentAnalysisRouter(generate: Generate = analyzeDocumentBytes): IRouter {
  const router: IRouter = Router();
  const active = new Set<string>();
  const limits = new Map<string, { since: number; count: number }>();
  router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  const owned = async (caseId: number, documentId: string, userId: string) => {
    const [item] = await db.select({ document: documentsTable }).from(documentsTable)
      .innerJoin(casesTable, eq(casesTable.id, documentsTable.caseId))
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.caseId, caseId),
        eq(documentsTable.ownerId, userId), eq(casesTable.ownerId, userId), eq(documentsTable.status, "ready"),
        eq(documentsTable.scanStatus, "clean")));
    return item?.document;
  };
  router.get("/cases/:id/documents/:documentId/analyses", async (req, res): Promise<void> => {
    const params = ListDocumentAnalysesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Dokumen tidak valid." }); return; }
    const userId = getAuth(req).userId!;
    if (!await owned(params.data.id, params.data.documentId, userId)) { res.status(404).json({ error: "Dokumen tidak ditemukan." }); return; }
    const rows = await db.select().from(documentAnalysesTable).where(and(
      eq(documentAnalysesTable.documentId, params.data.documentId), eq(documentAnalysesTable.caseId, params.data.id),
      eq(documentAnalysesTable.ownerId, userId))).orderBy(desc(documentAnalysesTable.createdAt), desc(documentAnalysesTable.id));
    res.json(ListDocumentAnalysesResponse.parse(rows.map((row) => ({ ...row, disclaimer: ANALYSIS_DISCLAIMER }))));
  });
  router.post("/cases/:id/documents/:documentId/analyses", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    // Defense in depth for the expensive operation; this header is not auth.
    if (!userId) { res.status(401).json({ error: "Silakan masuk." }); return; }
    if (req.get("X-SBU-Form-Owner") !== userId) { res.status(409).json({ error: "Sesi berubah. Muat ulang sebelum menjalankan bedah dokumen." }); return; }
    const params = AnalyzeCaseDocumentParams.safeParse(req.params);
    const input = AnalyzeCaseDocumentBody.safeParse(req.body);
    if (!params.success || !input.success || input.data.consent !== true ||
        Object.keys(req.body ?? {}).some((key) => !["consent", "focus", "question"].includes(key))) {
      res.status(400).json({ error: "Pilih fokus dan setujui pengiriman dokumen yang dipilih ke penyedia AI." }); return;
    }
    const document = await owned(params.data.id, params.data.documentId, userId);
    if (!document || !document.scanGeneration) { res.status(404).json({ error: "Dokumen belum tersedia atau masih dikarantina." }); return; }
    if (document.size > MAX_ANALYSIS_BYTES) {
      res.status(422).json({ error: "Bedah dokumen dibatasi 4 MiB dan PDF maksimal 10 halaman. Buat salinan ringkas; dokumen asli tetap tersimpan." }); return;
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(documentAnalysesTable)
      .where(and(eq(documentAnalysesTable.documentId, document.id), eq(documentAnalysesTable.ownerId, userId)));
    if (count >= 10) { res.status(429).json({ error: "Maksimal 10 hasil bedah per versi dokumen. Hapus hasil yang tidak diperlukan." }); return; }
    const now = Date.now();
    for (const [id, limit] of limits) if (!active.has(id) && now - limit.since >= 60000) limits.delete(id);
    let limit = limits.get(userId);
    if (!limit) {
      if (limits.size >= 1000) { res.status(503).json({ error: "Layanan sedang sibuk." }); return; }
      limit = { since: now, count: 0 }; limits.set(userId, limit);
    }
    if (active.has(userId) || limit.count >= 3) {
      res.set("Retry-After", "60"); res.status(429).json({ error: "Tunggu bedah sebelumnya atau coba lagi dalam satu menit." }); return;
    }
    limit.count++; active.add(userId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    try {
      const run = async () => {
        const file = await documentStorage.file(document.objectPath, document.scanGeneration);
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size) !== document.size || metadata.contentType !== document.contentType ||
            metadata.contentEncoding || document.size > MAX_ANALYSIS_BYTES) throw new AnalysisFormatError();
        const [bytes] = await file.download();
        if (bytes.length !== document.size) throw new AnalysisFormatError();
        controller.signal.throwIfAborted();
        const result = AnalyzeCaseDocumentResponse.shape.result.parse(
          await generate(bytes, document.contentType, input.data, controller.signal));
        controller.signal.throwIfAborted();
        // Recheck source existence and quota under a lock after the model call.
        // No transaction or row lock is held during a paid provider request.
        return db.transaction(async (tx) => {
          const [current] = await tx.select().from(documentsTable).where(and(eq(documentsTable.id, document.id),
            eq(documentsTable.ownerId, userId), eq(documentsTable.caseId, document.caseId),
            eq(documentsTable.status, "ready"), eq(documentsTable.scanStatus, "clean"),
            eq(documentsTable.scanGeneration, document.scanGeneration!))).for("update");
          if (!current) return null;
          const [{ stored }] = await tx.select({ stored: sql<number>`count(*)::int` }).from(documentAnalysesTable)
            .where(and(eq(documentAnalysesTable.documentId, document.id), eq(documentAnalysesTable.ownerId, userId)));
          if (stored >= 10 || controller.signal.aborted) return null;
          const [saved] = await tx.insert(documentAnalysesTable).values({
            id: randomUUID(), documentId: document.id, caseId: document.caseId, ownerId: userId,
            focus: input.data.focus, result, model: ANALYSIS_MODEL,
          }).returning();
          return saved;
        });
      };
      const aborted = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener("abort", () => reject(new Error("analysis_cancelled")), { once: true }));
      const row = await Promise.race([run(), aborted]);
      if (res.destroyed) return;
      if (!row) { res.status(409).json({ error: "Dokumen atau batas riwayat berubah. Muat ulang sebelum mencoba kembali." }); return; }
      res.status(201).json(AnalyzeCaseDocumentResponse.parse({ ...row, disclaimer: ANALYSIS_DISCLAIMER }));
    } catch (error) {
      // Do not log bytes, extracted information, model output, prompts or provider errors.
      if (!res.destroyed) res.status(error instanceof AnalysisFormatError ? 422 : 503).json({
        error: error instanceof AnalysisFormatError
          ? "Dokumen tidak dapat dibedah: gunakan PDF yang dapat dibuka maksimal 10 halaman atau gambar, maksimal 4 MiB."
          : "Bedah belum berhasil dikonfirmasi. Periksa riwayat sebelum mencoba lagi; dokumen asli tidak diubah.",
      });
    } finally { clearTimeout(timer); res.off("close", disconnect); active.delete(userId); }
  });
  router.delete("/cases/:id/documents/:documentId/analyses/:analysisId", async (req, res): Promise<void> => {
    const params = DeleteDocumentAnalysisParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Analisis tidak valid." }); return; }
    const userId = getAuth(req).userId!;
    if (!await owned(params.data.id, params.data.documentId, userId)) { res.status(404).json({ error: "Analisis tidak ditemukan." }); return; }
    const rows = await db.delete(documentAnalysesTable).where(and(eq(documentAnalysesTable.id, params.data.analysisId),
      eq(documentAnalysesTable.documentId, params.data.documentId), eq(documentAnalysesTable.caseId, params.data.id),
      eq(documentAnalysesTable.ownerId, userId))).returning({ id: documentAnalysesTable.id });
    if (!rows.length) { res.status(404).json({ error: "Analisis tidak ditemukan." }); return; }
    res.sendStatus(204);
  });
  return router;
}
export default createDocumentAnalysisRouter();
