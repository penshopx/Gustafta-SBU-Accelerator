import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, casesTable, documentsTable } from "@workspace/db";
import {
  ListDocumentVaultQueryParams, ListDocumentVaultResponse,
  UpdateCaseDocumentMetadataParams, UpdateCaseDocumentMetadataBody, UpdateCaseDocumentMetadataResponse,
} from "@workspace/api-zod";
import { publicDocument } from "../lib/document-metadata";

// Mounted AFTER SBU session verification and immutable form-owner preconditions.
const router: IRouter = Router();
router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
router.get("/documents", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const query = ListDocumentVaultQueryParams.safeParse({
    ...req.query,
    page: req.query.page === undefined ? undefined : Number(req.query.page),
    caseId: req.query.caseId === undefined ? undefined : Number(req.query.caseId),
  });
  if (!query.success) { res.status(400).json({ error: "Filter dokumen tidak valid." }); return; }
  const { q, category, caseId } = query.data;
  const page = query.data.page ?? 1;
  const pattern = q?.trim() ? `%${q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  const filter = and(
    eq(documentsTable.ownerId, userId), eq(casesTable.ownerId, userId),
    category ? eq(documentsTable.category, category) : undefined,
    caseId ? eq(documentsTable.caseId, caseId) : undefined,
    pattern ? or(ilike(documentsTable.name, pattern), ilike(documentsTable.description, pattern)) : undefined,
  );
  // One snapshot for count + page so concurrent uploads do not mix these results.
  const payload = await db.transaction(async (tx) => {
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` })
      .from(documentsTable).innerJoin(casesTable, eq(casesTable.id, documentsTable.caseId)).where(filter);
    const rows = await tx.select({ document: documentsTable, caseName: casesTable.companyName })
      .from(documentsTable).innerJoin(casesTable, eq(casesTable.id, documentsTable.caseId)).where(filter)
      .orderBy(desc(documentsTable.createdAt), desc(documentsTable.id)).limit(50).offset((page - 1) * 50);
    return { userId, documents: rows.map(({ document, caseName }) => ({ ...publicDocument(document), caseName })),
      total, page, pageSize: 50 };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(ListDocumentVaultResponse.parse(payload));
});
router.patch("/cases/:id/documents/:documentId", async (req, res): Promise<void> => {
  const params = UpdateCaseDocumentMetadataParams.safeParse(req.params);
  const input = UpdateCaseDocumentMetadataBody.safeParse(req.body);
  if (!params.success || !input.success || !input.data.name.trim() ||
      /[\/\\\x00-\x1f\x7f]/.test(input.data.name) ||
      Object.keys(req.body ?? {}).some((key) => !["name", "category", "description"].includes(key))) {
    res.status(400).json({ error: "Nama, kategori, atau catatan dokumen tidak valid." }); return;
  }
  const userId = getAuth(req).userId!;
  const [owned] = await db.select().from(casesTable).where(and(eq(casesTable.id, params.data.id), eq(casesTable.ownerId, userId)));
  if (!owned) { res.status(404).json({ error: "Dokumen tidak ditemukan." }); return; }
  const [row] = await db.update(documentsTable).set({
    name: input.data.name.trim(), category: input.data.category, description: input.data.description.trim(),
  }).where(and(eq(documentsTable.id, params.data.documentId), eq(documentsTable.caseId, params.data.id),
    eq(documentsTable.ownerId, userId), eq(documentsTable.status, "ready"))).returning();
  if (!row) { res.status(404).json({ error: "Dokumen belum tersedia." }); return; }
  res.json(UpdateCaseDocumentMetadataResponse.parse(publicDocument(row)));
});
export default router;
