import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, casesTable, documentsTable, documentAnalysesTable, documentAnalysisOperationsTable } from "@workspace/db";
import {
  ListDocumentAnalysesParams, ListDocumentAnalysesResponse, AnalyzeCaseDocumentParams,
  AnalyzeCaseDocumentBody, AnalyzeCaseDocumentResponse, DeleteDocumentAnalysisParams,
  type DocumentAnalysisInput, type DocumentAnalysisResult,
  GetDocumentAnalysisSourceParams, GetDocumentAnalysisSourceResponse,
  PreviewDocumentAnalysisParams, PreviewDocumentAnalysisBody, PreviewDocumentAnalysisResponse,
  GetConsultationAnalysisPreviewParams,
} from "@workspace/api-zod";
import { consultationAnalysis, ConsultationSourceError, sourceErrorMessage } from "../lib/consultation-analysis";
import { documentStorage } from "../lib/document-storage";
import { ANALYSIS_DISCLAIMER, ANALYSIS_MODEL, AnalysisFormatError, MAX_ANALYSIS_BYTES, analyzeDocumentBytes } from "../lib/document-analysis";
import { prepareAnalysisPayload, sourcePageCount, sourceRevision } from "../lib/document-analysis-pages";
import { MAX_DOCUMENT_BYTES } from "../lib/document-validation";
import { AiBudgetError, reserveAiBudget, type ReserveAiBudget } from "../lib/ai-budget";
import { documentOperationStore, DocumentOperationError, DOCUMENT_OPERATION_TIMEOUT_MS,
  type DocumentOperationStore } from "../lib/document-analysis-operations";

type Generate = (bytes: Buffer, contentType: string, input: DocumentAnalysisInput, signal: AbortSignal) => Promise<DocumentAnalysisResult>;
// Real SBU auth + immutable form owner middleware must precede this router.
export function createDocumentAnalysisRouter(generate: Generate = analyzeDocumentBytes, reserveBudget: ReserveAiBudget = reserveAiBudget,
  operations: DocumentOperationStore = documentOperationStore, timeoutMs = DOCUMENT_OPERATION_TIMEOUT_MS): IRouter {
  const router: IRouter = Router();
  const startOperation = async (req: Request, res: Response, userId: string, kind: "analysis" | "inspection") => {
    let token: string;
    try { token = await operations.reserve(userId, kind); }
    catch (error) {
      if (res.destroyed) return;
      const status = error instanceof DocumentOperationError ? error.status : 503;
      if (status === 429) res.set("Retry-After", "60");
      res.status(status).json({ error: status === 429
        ? "Tunggu operasi dokumen sebelumnya atau coba lagi dalam satu menit."
        : "Batas operasi dokumen belum dapat diverifikasi. Coba lagi nanti." });
      return;
    }
    if (req.aborted || res.destroyed) { await operations.release(userId, token); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, DOCUMENT_OPERATION_TIMEOUT_MS));
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    // Attach the rejection handler immediately, before any storage await.
    let rejectAbort: (reason: Error) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    void aborted.catch(() => {});
    const onAbort = () => rejectAbort(new Error("document_operation_cancelled"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    return {
      token, controller,
      race: <T>(work: Promise<T>) => Promise.race([work, aborted]),
      finish: async () => {
        clearTimeout(timer);
        res.off("close", disconnect);
        controller.signal.removeEventListener("abort", onAbort);
        await operations.release(userId, token);
      },
    };
  };
  router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  router.use((req, res, next) => {
    if (!/^\/cases\/[^/]+\/documents\/[^/]+\/(?:analyses(?:\/|$)|analysis-source(?:\/|$)|analysis-preview(?:\/|$))/.test(req.path)) {
      next(); return;
    }
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Silakan masuk." }); return; }
    if (req.get("X-SBU-Form-Owner") !== userId) {
      res.status(409).json({ error: "Sesi berubah. Muat ulang sebelum membuka dokumen." }); return;
    }
    next();
  });
  const owned = async (caseId: number, documentId: string, userId: string) => {
    const [item] = await db.select({ document: documentsTable }).from(documentsTable)
      .innerJoin(casesTable, eq(casesTable.id, documentsTable.caseId))
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.caseId, caseId),
        eq(documentsTable.ownerId, userId), eq(casesTable.ownerId, userId), eq(documentsTable.status, "ready"),
        eq(documentsTable.scanStatus, "clean")));
    return item?.document;
  };
  const readSource = async (document: NonNullable<Awaited<ReturnType<typeof owned>>>) => {
    if (!document.scanGeneration || document.size > MAX_DOCUMENT_BYTES) throw new AnalysisFormatError();
    const file = await documentStorage.file(document.objectPath, document.scanGeneration);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== document.size || metadata.contentType !== document.contentType ||
        metadata.contentEncoding) throw new AnalysisFormatError();
    const [bytes] = await file.download();
    if (bytes.length !== document.size) throw new AnalysisFormatError();
    return bytes;
  };
  router.get("/cases/:id/documents/:documentId/analysis-source", async (req, res): Promise<void> => {
    const params = GetDocumentAnalysisSourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Dokumen tidak valid." }); return; }
    const userId = getAuth(req).userId!;
    const document = await owned(params.data.id, params.data.documentId, userId);
    if (!document?.scanGeneration) { res.status(404).json({ error: "Dokumen belum tersedia." }); return; }
    const operation = await startOperation(req, res, userId, "inspection");
    if (!operation) return;
    try {
      const count = await operation.race((async () => {
        const bytes = await readSource(document);
        operation.controller.signal.throwIfAborted();
        const count = await sourcePageCount(bytes, document.contentType);
        operation.controller.signal.throwIfAborted();
        await operations.assertCurrent(userId, operation.token);
        return count;
      })());
      if (res.destroyed) return;
      res.json(GetDocumentAnalysisSourceResponse.parse({ documentId: document.id, version: document.version,
        sourceRevision: sourceRevision(document), pageCount: count, model: ANALYSIS_MODEL }));
    } catch {
      if (!res.destroyed) res.status(422).json({ error: "Jumlah halaman tidak dapat dibaca. Dokumen asli tidak diubah dan tidak dikirim ke AI." });
    } finally { await operation.finish(); }
  });
  router.post("/cases/:id/documents/:documentId/analysis-preview", async (req, res): Promise<void> => {
    const params = PreviewDocumentAnalysisParams.safeParse(req.params);
    const input = PreviewDocumentAnalysisBody.safeParse(req.body);
    if (!params.success || !input.success ||
        Object.keys(req.body ?? {}).some(key => !["pages", "sourceRevision"].includes(key)) ||
        new Set(input.data.pages).size !== input.data.pages.length) {
      res.status(400).json({ error: "Pilih 1–10 halaman tanpa duplikat." }); return;
    }
    const userId = getAuth(req).userId!;
    const document = await owned(params.data.id, params.data.documentId, userId);
    if (!document?.scanGeneration) { res.status(404).json({ error: "Dokumen belum tersedia." }); return; }
    if (sourceRevision(document) !== input.data.sourceRevision) {
      res.status(409).json({ error: "Versi dokumen berubah. Muat ulang sebelum membuat pratinjau." }); return;
    }
    const operation = await startOperation(req, res, userId, "inspection");
    if (!operation) return;
    const { controller } = operation;
    try {
      const { payload, current } = await operation.race((async () => {
        const bytes = await readSource(document);
        controller.signal.throwIfAborted();
        const payload = await prepareAnalysisPayload(bytes, document.contentType, input.data.pages, controller.signal);
        controller.signal.throwIfAborted();
        await operations.assertCurrent(userId, operation.token);
        const current = await owned(params.data.id, params.data.documentId, userId);
        controller.signal.throwIfAborted();
        return { payload, current };
      })());
      controller.signal.throwIfAborted();
      if (!current || sourceRevision(current) !== input.data.sourceRevision) {
        res.status(409).json({ error: "Dokumen berubah. Buat pratinjau baru." }); return;
      }
      if (!res.destroyed) res.json(PreviewDocumentAnalysisResponse.parse({
        documentId: document.id, caseId: document.caseId, version: document.version,
        sourceRevision: sourceRevision(document), payloadBytes: payload.bytes.length, images: payload.images,
      }));
    } catch {
      if (!res.destroyed) res.status(422).json({ error: "Pratinjau tidak dapat dibuat. Pilih 1–10 halaman, maksimal 4 MiB. Tidak ada pengiriman ke AI." });
    } finally { await operation.finish(); }
  });
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
        Object.keys(req.body ?? {}).some((key) => !["consent", "focus", "question", "pages", "sourceRevision"].includes(key)) ||
        (input.success && new Set(input.data.pages).size !== input.data.pages.length)) {
      res.status(400).json({ error: "Pilih fokus dan setujui pengiriman dokumen yang dipilih ke penyedia AI." }); return;
    }
    const document = await owned(params.data.id, params.data.documentId, userId);
    if (!document || !document.scanGeneration) { res.status(404).json({ error: "Dokumen belum tersedia atau masih dikarantina." }); return; }
    if (sourceRevision(document) !== input.data.sourceRevision) {
      res.status(409).json({ error: "Versi dokumen berubah. Baca ulang jumlah halaman dan berikan persetujuan baru." }); return;
    }
    if (document.size > MAX_DOCUMENT_BYTES || (document.contentType !== "application/pdf" && document.size > MAX_ANALYSIS_BYTES)) {
      res.status(422).json({ error: "Berkas asli maksimal 20 MiB; payload AI maksimal 4 MiB." }); return;
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(documentAnalysesTable)
      .where(and(eq(documentAnalysesTable.documentId, document.id), eq(documentAnalysesTable.ownerId, userId)));
    if (count >= 10) { res.status(429).json({ error: "Maksimal 10 hasil bedah per versi dokumen. Hapus hasil yang tidak diperlukan." }); return; }
    const operation = await startOperation(req, res, userId, "analysis");
    if (!operation) return;
    const { controller } = operation;
    try {
      const run = async () => {
        const bytes = await readSource(document);
        controller.signal.throwIfAborted();
        const payload = await prepareAnalysisPayload(bytes, document.contentType, input.data.pages, controller.signal);
        controller.signal.throwIfAborted();
        await operations.assertCurrent(userId, operation.token);
        controller.signal.throwIfAborted();
        await reserveBudget("document_analysis");
        controller.signal.throwIfAborted();
        await operations.assertCurrent(userId, operation.token);
        controller.signal.throwIfAborted();
        const result = AnalyzeCaseDocumentResponse.shape.result.parse(
          await generate(payload.bytes, document.contentType, input.data, controller.signal));
        controller.signal.throwIfAborted();
        // Recheck source existence and quota under a lock after the model call.
        // No transaction or row lock is held during a paid provider request.
        return db.transaction(async (tx) => {
          // Fence a stale worker after expiry/takeover, including a provider
          // that ignored cancellation. Release uses the same token condition.
          const [lease] = await tx.select().from(documentAnalysisOperationsTable).where(and(
            eq(documentAnalysisOperationsTable.ownerId, userId),
            eq(documentAnalysisOperationsTable.token, operation.token),
            sql`${documentAnalysisOperationsTable.expiresAt} > clock_timestamp()`)).for("update");
          if (!lease || controller.signal.aborted) return null;
          const [current] = await tx.select().from(documentsTable).where(and(eq(documentsTable.id, document.id),
            eq(documentsTable.ownerId, userId), eq(documentsTable.caseId, document.caseId),
            eq(documentsTable.status, "ready"), eq(documentsTable.scanStatus, "clean"),
            eq(documentsTable.version, document.version),
            eq(documentsTable.scanGeneration, document.scanGeneration!))).for("update");
          if (!current) return null;
          const [{ stored }] = await tx.select({ stored: sql<number>`count(*)::int` }).from(documentAnalysesTable)
            .where(and(eq(documentAnalysesTable.documentId, document.id), eq(documentAnalysesTable.ownerId, userId)));
          if (stored >= 10 || controller.signal.aborted) return null;
          const [saved] = await tx.insert(documentAnalysesTable).values({
            id: randomUUID(), documentId: document.id, caseId: document.caseId, ownerId: userId,
            focus: input.data.focus, result, model: ANALYSIS_MODEL,
            sourcePages: input.data.pages, sourcePageCount: payload.pageCount, sourceVersion: document.version,
          }).returning();
          controller.signal.throwIfAborted();
          return saved;
        });
      };
      const row = await operation.race(run());
      if (res.destroyed) return;
      if (!row) { res.status(409).json({ error: "Dokumen atau batas riwayat berubah. Muat ulang sebelum mencoba kembali." }); return; }
      res.status(201).json(AnalyzeCaseDocumentResponse.parse({ ...row, disclaimer: ANALYSIS_DISCLAIMER }));
    } catch (error) {
      // Do not log bytes, extracted information, model output, prompts or provider errors.
      if (error instanceof AiBudgetError) {
        if (!res.destroyed) res.status(503).json({ error: error.message, code: error.code });
        return;
      }
      if (!res.destroyed) res.status(error instanceof AnalysisFormatError ? 422 : 503).json({
        error: error instanceof AnalysisFormatError
          ? "Pilihan halaman tidak dapat dibedah. Pilih 1–10 halaman yang ada; payload hasil maksimal 4 MiB. PDF harus dapat dibuka dan tidak terproteksi."
          : "Bedah belum berhasil dikonfirmasi. Periksa riwayat sebelum mencoba lagi; dokumen asli tidak diubah.",
      });
    } finally { await operation.finish(); }
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
  router.get("/cases/:id/documents/:documentId/analyses/:analysisId/consultation-preview", async (req, res): Promise<void> => {
    const params = GetConsultationAnalysisPreviewParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Analisis tidak valid." }); return; }
    try {
      res.json(await consultationAnalysis(params.data.id, params.data.documentId, params.data.analysisId, getAuth(req).userId!));
    } catch (error) {
      if (!(error instanceof ConsultationSourceError)) throw error;
      res.status(error.status).json({ error: sourceErrorMessage() });
    }
  });
  return router;
}
export default createDocumentAnalysisRouter();
