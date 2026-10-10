import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import * as persistence from "@workspace/db";
import {
  GetLocalCompanyProfileResponse, PutLocalCompanyProfileBody, PutLocalCompanyProfileResponse,
  ListCaseDocumentsParams, ListCaseDocumentsResponse,
  RequestCaseDocumentUploadParams, RequestCaseDocumentUploadBody, RequestCaseDocumentUploadResponse,
  CompleteCaseDocumentUploadParams, CompleteCaseDocumentUploadResponse,
  DeleteCaseDocumentParams, DownloadCaseDocumentParams,
} from "@workspace/api-zod";
import { documentStorage, DocumentValidationError } from "../lib/document-storage";
import { ObjectNotFoundError } from "../lib/objectStorage";
import { publicDocument } from "../lib/document-metadata";
import { documentActivityLock } from "../lib/document-lifecycle-lock";
import { DOCUMENT_COMPLETION_WINDOW_MS } from "../lib/document-validation";

// Mounted inside the SBU router, AFTER its real Clerk authentication and
// immutable form-owner precondition. No token supplied by the browser grants access.
const router: IRouter = Router();
const { db, casesTable, profilesTable } = persistence;
const companies = persistence.companyProfilesTable;
const documents = persistence.documentsTable;
router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
const owner = (req: Parameters<typeof getAuth>[0]) => {
  const id = getAuth(req).userId;
  if (!id) throw new Error("Authentication required");
  return id;
};
async function ownsCase(caseId: number, userId: string) {
  const [row] = await db.select().from(casesTable).where(and(eq(casesTable.id, caseId), eq(casesTable.ownerId, userId)));
  return row;
}
router.get("/company-profile", async (req, res): Promise<void> => {
  const userId = owner(req);
  const [profile] = await db.select().from(companies).where(eq(companies.ownerId, userId));
  res.json(GetLocalCompanyProfileResponse.parse(profile ?? {
    ownerId: userId, companyName: "", nib: "", npwp: "", address: "", responsiblePerson: "", updatedAt: new Date(),
  }));
});
router.put("/company-profile", async (req, res): Promise<void> => {
  const input = PutLocalCompanyProfileBody.safeParse(req.body);
  const allowed = ["companyName", "nib", "npwp", "address", "responsiblePerson"];
  if (!input.success || Object.keys(req.body ?? {}).some((k) => !allowed.includes(k))) {
    res.status(400).json({ error: "Profil perusahaan tidak valid. NIB harus kosong atau terdiri dari 13 angka." }); return;
  }
  const userId = owner(req);
  await db.insert(profilesTable).values({ userId }).onConflictDoNothing();
  const values = Object.fromEntries(Object.entries(input.data).map(([k, v]) => [k, v.trim()])) as typeof input.data;
  const [profile] = await db.insert(companies).values({ ownerId: userId, ...values })
    .onConflictDoUpdate({ target: companies.ownerId, set: { ...values, updatedAt: new Date() } }).returning();
  res.json(PutLocalCompanyProfileResponse.parse(profile));
});
router.get("/cases/:id/documents", async (req, res): Promise<void> => {
  const params = ListCaseDocumentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID kasus tidak valid." }); return; }
  const userId = owner(req);
  if (!await ownsCase(params.data.id, userId)) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
  const rows = await db.select().from(documents).where(and(eq(documents.caseId, params.data.id), eq(documents.ownerId, userId)))
    .orderBy(desc(documents.createdAt), desc(documents.id));
  res.json(ListCaseDocumentsResponse.parse(rows.map(publicDocument)));
});
router.post("/cases/:id/documents", async (req, res): Promise<void> => {
  const params = RequestCaseDocumentUploadParams.safeParse(req.params);
  const input = RequestCaseDocumentUploadBody.safeParse(req.body);
  if (!params.success || !input.success || !input.data.name.trim() || /[\/\\\x00-\x1f\x7f]/.test(input.data.name) ||
    Object.keys(req.body ?? {}).some((k) => !["name", "size", "contentType", "category", "description", "versionOf"].includes(k))) {
    res.status(400).json({ error: "Berkas tidak valid. Gunakan PDF, PNG, atau JPG, maksimal 20 MB." }); return;
  }
  const userId = owner(req);
  if (!await ownsCase(params.data.id, userId)) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(documentActivityLock);
      // Serialize quota reservations for this owner, not only for one case.
      await tx.select().from(profilesTable).where(eq(profilesTable.userId, userId)).for("update");
      const [owned] = await tx.select().from(casesTable)
        .where(and(eq(casesTable.id, params.data.id), eq(casesTable.ownerId, userId))).for("update");
      if (!owned) return { status: 404, error: "Kasus tidak ditemukan." } as const;
      const rows = await tx.select().from(documents).where(eq(documents.ownerId, userId));
      const previous = input.data.versionOf ? rows.find((row) =>
        row.id === input.data.versionOf && row.caseId === params.data.id && row.status === "ready") : undefined;
      if (input.data.versionOf && !previous) return { status: 404, error: "Versi sumber tidak ditemukan pada kasus ini." } as const;
      const documentId = randomUUID();
      const seriesId = previous ? previous.seriesId ?? previous.id : documentId;
      const version = previous ? Math.max(...rows.filter((row) =>
        (row.seriesId ?? row.id) === seriesId).map((row) => row.version ?? 1)) + 1 : 1;
      if (rows.filter((r) => r.caseId === params.data.id).length >= 20 ||
        rows.reduce((s, r) => s + r.size, 0) + input.data.size > 200 * 1024 * 1024) {
        return { status: 409, error: "Batas penyimpanan tercapai: 20 dokumen per kasus atau 200 MB per akun. Hapus dokumen yang tidak diperlukan." } as const;
      }
      const reservation = await documentStorage.reserve();
      const [row] = await tx.insert(documents).values({
        id: documentId, ownerId: userId, caseId: params.data.id,
        size: input.data.size, contentType: input.data.contentType,
        category: input.data.category ?? previous?.category ?? "lainnya",
        description: input.data.description?.trim() ?? previous?.description ?? "",
        seriesId, version,
        name: input.data.name.trim(), objectPath: reservation.objectPath,
      }).returning();
      return { status: 201, row, uploadURL: reservation.uploadURL } as const;
    });
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
    res.status(201).json(RequestCaseDocumentUploadResponse.parse({ document: publicDocument(result.row), uploadURL: result.uploadURL }));
  } catch {
    req.log.warn({ event: "document_upload_reservation_failed" }, "Document storage unavailable");
    res.status(503).json({ error: "Penyimpanan belum dapat diakses. Coba lagi; berkas belum tercatat." });
  }
});
router.post("/cases/:id/documents/:documentId/complete", async (req, res): Promise<void> => {
  const params = CompleteCaseDocumentUploadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID dokumen tidak valid." }); return; }
  const userId = owner(req);
  if (!await ownsCase(params.data.id, userId)) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
  let sealedPath: string | undefined;
  let stagedPath: string | undefined;
  try {
    const row = await db.transaction(async (tx) => {
      await tx.execute(documentActivityLock);
      const [item] = await tx.select().from(documents).where(and(eq(documents.id, params.data.documentId),
        eq(documents.caseId, params.data.id), eq(documents.ownerId, userId))).for("update");
      if (!item) return undefined;
      if (item.status === "ready") return item;
      if (Date.now() - item.createdAt.getTime() > DOCUMENT_COMPLETION_WINDOW_MS) throw new DocumentValidationError();
      stagedPath = item.objectPath;
      sealedPath = await documentStorage.seal(item.objectPath, item.id, userId, item.contentType, item.size);
      const [completed] = await tx.update(documents).set({ status: "ready", objectPath: sealedPath })
        .where(eq(documents.id, item.id)).returning();
      CompleteCaseDocumentUploadResponse.parse(publicDocument(completed));
      return completed;
    });
    if (!row) { res.status(404).json({ error: "Dokumen tidak ditemukan." }); return; }
    // Cleanup is not part of declaring success; a failed cleanup never removes
    // the immutable ready object. Stage URLs expire after fifteen minutes.
    if (stagedPath) await documentStorage.remove(stagedPath).catch(() => {
      req.log.warn({ event: "document_stage_cleanup_failed" }, "Temporary upload cleanup deferred");
    });
    res.json(CompleteCaseDocumentUploadResponse.parse(publicDocument(row)));
  } catch (error) {
    // Commit failures can be ambiguous; a concurrent retry may already refer
    // to the sealed file. Only locked reconciliation may reclaim this orphan.
    if (error instanceof DocumentValidationError) {
      res.status(422).json({ error: "Isi, ukuran, atau jenis berkas tidak cocok, atau unggahan sudah kedaluwarsa. Batalkan unggahan lalu unggah ulang." }); return;
    }
    req.log.warn({ event: "document_upload_completion_failed" }, "Document completion failed");
    res.status(503).json({ error: "Unggahan belum selesai dicatat. Coba lagi atau batalkan unggahan." });
  }
});
router.delete("/cases/:id/documents/:documentId", async (req, res): Promise<void> => {
  const params = DeleteCaseDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID dokumen tidak valid." }); return; }
  const userId = owner(req);
  if (!await ownsCase(params.data.id, userId)) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
  try {
    const removed = await db.transaction(async (tx) => {
      await tx.execute(documentActivityLock);
      const [item] = await tx.select().from(documents).where(and(eq(documents.id, params.data.documentId),
        eq(documents.caseId, params.data.id), eq(documents.ownerId, userId))).for("update");
      if (!item) return false;
      await documentStorage.remove(item.objectPath);
      await tx.delete(documents).where(eq(documents.id, item.id));
      return true;
    });
    if (!removed) { res.status(404).json({ error: "Dokumen tidak ditemukan." }); return; }
    res.sendStatus(204);
  } catch {
    req.log.warn({ event: "document_deletion_failed" }, "Document deletion failed");
    res.status(503).json({ error: "Dokumen belum berhasil dihapus. Catatan tetap ditampilkan; coba lagi." });
  }
});
router.get("/cases/:id/documents/:documentId/download", async (req, res): Promise<void> => {
  const params = DownloadCaseDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID dokumen tidak valid." }); return; }
  const userId = owner(req);
  if (!await ownsCase(params.data.id, userId)) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
  const [item] = await db.select().from(documents).where(and(eq(documents.id, params.data.documentId),
    eq(documents.caseId, params.data.id), eq(documents.ownerId, userId), eq(documents.status, "ready")));
  if (!item) { res.status(404).json({ error: "Dokumen belum tersedia." }); return; }
  try {
    const file = await documentStorage.file(item.objectPath);
    res.set({
      "Content-Type": item.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    });
    const stream = file.createReadStream();
    stream.on("error", () => {
      req.log.warn({ event: "document_download_failed" }, "Document download failed");
      if (!res.headersSent) res.status(503).json({ error: "Dokumen belum dapat diunduh. Coba lagi." });
      else res.destroy();
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    res.status(error instanceof ObjectNotFoundError ? 404 : 503).json({ error: "Dokumen belum dapat diunduh." });
  }
});
export default router;
