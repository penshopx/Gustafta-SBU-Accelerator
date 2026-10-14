import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, workroomReviewsTable, type WorkroomReviewRow } from "@workspace/db";
import {
  GetWorkroomReviewsParams, GetWorkroomReviewsResponse, PreviewWorkroomReviewBody,
  PreviewWorkroomReviewResponse, CreateWorkroomReviewBody, CreateWorkroomReviewResponse,
} from "@workspace/api-zod";
import { loadReviewMaterials, normalizeSelection, pickReviewMaterials, reviewHash } from "../lib/workroom-review-materials";

const serialize = (row: WorkroomReviewRow, current: boolean) => CreateWorkroomReviewResponse.parse({
  ...row, decidedAt: row.decidedAt.toISOString(), current,
});
export function createWorkroomReviewsRouter(): IRouter {
  const router: IRouter = Router();
  router.use("/cases/:id/workroom/reviews", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const ownerId = getAuth(req).userId;
    if (!ownerId) { res.status(401).json({ error: "Silakan masuk untuk melanjutkan." }); return; }
    if (req.get("X-SBU-Form-Owner") !== ownerId) {
      res.status(409).json({ error: "Sesi akun berubah. Muat ulang sebelum meninjau berkas." }); return;
    }
    next();
  });
  router.get("/cases/:id/workroom/reviews", async (req, res): Promise<void> => {
    const params = GetWorkroomReviewsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "ID kasus tidak sah." }); return; }
    const ownerId = getAuth(req).userId!, caseId = params.data.id;
    const result = await db.transaction(async tx => {
      const materials = await loadReviewMaterials(tx, caseId, ownerId);
      if (!materials) return null;
      const rows = await tx.select().from(workroomReviewsTable)
        .where(and(eq(workroomReviewsTable.caseId, caseId), eq(workroomReviewsTable.ownerId, ownerId)))
        .orderBy(desc(workroomReviewsTable.sequenceNo)).limit(51);
      return GetWorkroomReviewsResponse.parse({
        caseId, materials, historyTruncated: rows.length > 50,
        reviews: rows.slice(0, 50).map(row => {
          const currentMaterials = pickReviewMaterials(materials, PreviewWorkroomReviewBody.parse(row.selection));
          return serialize(row, !!currentMaterials && reviewHash(currentMaterials) === row.snapshotHash);
        }),
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if (!result) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
    res.json(result);
  });
  router.post("/cases/:id/workroom/reviews/preview", async (req, res): Promise<void> => {
    const params = GetWorkroomReviewsParams.safeParse(req.params), body = PreviewWorkroomReviewBody.safeParse(req.body);
    const selection = body.success ? normalizeSelection(body.data) : null;
    if (!params.success || !selection) { res.status(400).json({ error: "Pilih sedikitnya satu bahan yang sah, tanpa duplikasi." }); return; }
    const ownerId = getAuth(req).userId!, caseId = params.data.id;
    const result = await db.transaction(async tx => {
      const snapshot = await loadReviewMaterials(tx, caseId, ownerId, selection);
      if (!snapshot) return null;
      const [latest] = await tx.select({ id: workroomReviewsTable.id }).from(workroomReviewsTable)
        .where(and(eq(workroomReviewsTable.caseId, caseId), eq(workroomReviewsTable.ownerId, ownerId)))
        .orderBy(desc(workroomReviewsTable.sequenceNo)).limit(1);
      return PreviewWorkroomReviewResponse.parse({ snapshot, selection, snapshotHash: reviewHash(snapshot), latestReviewId: latest?.id ?? null });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if (!result) { res.status(404).json({ error: "Kasus atau bahan terpilih tidak tersedia." }); return; }
    res.json(result);
  });
  router.post("/cases/:id/workroom/reviews", async (req, res): Promise<void> => {
    const params = GetWorkroomReviewsParams.safeParse(req.params), body = CreateWorkroomReviewBody.safeParse(req.body);
    const selection = body.success ? normalizeSelection(body.data.selection) : null;
    if (!params.success || !body.success || !selection || !body.data.confirmed ||
        !body.data.note.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}]/gu, "")) {
      res.status(400).json({ error: "Bahan, catatan keputusan, dan konfirmasi peninjauan wajib diisi." }); return;
    }
    const ownerId = getAuth(req).userId!, caseId = params.data.id;
    const result = await db.transaction(async tx => {
      const snapshot = await loadReviewMaterials(tx, caseId, ownerId, selection, true);
      if (!snapshot) return { status: 404, error: "Kasus atau bahan terpilih tidak tersedia." };
      const snapshotHash = reviewHash(snapshot);
      const [latest] = await tx.select({ id: workroomReviewsTable.id, sequenceNo: workroomReviewsTable.sequenceNo }).from(workroomReviewsTable)
        .where(and(eq(workroomReviewsTable.caseId, caseId), eq(workroomReviewsTable.ownerId, ownerId)))
        .orderBy(desc(workroomReviewsTable.sequenceNo)).limit(1);
      if (snapshotHash !== body.data.snapshotHash || (latest?.id ?? null) !== body.data.latestReviewId) {
        return { status: 409, error: "Bahan atau keputusan sebelumnya berubah. Tinjau pratinjau baru; draf tidak dikirim ulang otomatis." };
      }
      const [row] = await tx.insert(workroomReviewsTable).values({
        id: randomUUID(), ownerId, caseId, sequenceNo: (latest?.sequenceNo ?? 0) + 1, selection, snapshot, snapshotHash,
        decision: body.data.decision, note: body.data.note.trim(), decidedAt: new Date(),
      }).returning();
      return { status: 201, record: CreateWorkroomReviewResponse.parse(serialize(row, true)) };
    });
    if (result.error) res.status(result.status).json({ error: result.error });
    else res.status(201).json(result.record);
  });
  return router;
}
export default createWorkroomReviewsRouter();
