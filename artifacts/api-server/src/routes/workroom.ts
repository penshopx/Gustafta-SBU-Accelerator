import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, casesTable, workroomItemsTable, type WorkroomItemRow } from "@workspace/db";
import {
  GetWorkroomParams, GetWorkroomResponse, CreateWorkroomItemBody,
  UpdateWorkroomItemParams, UpdateWorkroomItemBody, DeleteWorkroomItemBody,
  CreateWorkroomItemResponse,
} from "@workspace/api-zod";
import { validCalendarDay } from "../lib/skk-calendar";

const titleValid = (value: string | undefined) => value === undefined ||
  (value.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu, "").length > 0 &&
    !/[\p{Cc}\p{Cf}]/u.test(value));
const serialize = (row: WorkroomItemRow) => CreateWorkroomItemResponse.parse({
  ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function ownedCase(tx: Tx, id: number, ownerId: string) {
  const [item] = await tx.select({ id: casesTable.id }).from(casesTable)
    .where(and(eq(casesTable.id, id), eq(casesTable.ownerId, ownerId))).for("share");
  return item;
}
const journalFieldsValid = (kind: string, data: { status?: string; assignee?: string; dueOn?: string | null }) =>
  kind !== "journal" || ((!data.status || data.status === "todo") && !data.assignee && !data.dueOn);

export function createWorkroomRouter(): IRouter {
  const router: IRouter = Router();
  router.use("/cases/:id/workroom", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const ownerId = getAuth(req).userId;
    if (!ownerId) { res.status(401).json({ error: "Silakan masuk untuk melanjutkan." }); return; }
    if (req.get("X-SBU-Form-Owner") !== ownerId) {
      res.status(409).json({ error: "Sesi akun berubah. Muat ulang halaman." }); return;
    }
    next();
  });
  router.get("/cases/:id/workroom", async (req, res): Promise<void> => {
    const params = GetWorkroomParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "ID kasus tidak sah." }); return; }
    const caseId = params.data.id, ownerId = getAuth(req).userId!;
    const result = await db.transaction(async tx => {
      const [parent] = await tx.select({ id: casesTable.id }).from(casesTable)
        .where(and(eq(casesTable.id, caseId), eq(casesTable.ownerId, ownerId)));
      if (!parent) return null;
      const items = await tx.select().from(workroomItemsTable)
        .where(and(eq(workroomItemsTable.caseId, caseId), eq(workroomItemsTable.ownerId, ownerId)))
        .orderBy(desc(workroomItemsTable.createdAt), desc(workroomItemsTable.id));
      return GetWorkroomResponse.parse({ caseId, items: items.map(serialize) });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if (!result) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
    res.json(result);
  });
  router.post("/cases/:id/workroom", async (req, res): Promise<void> => {
    const params = GetWorkroomParams.safeParse(req.params);
    const body = CreateWorkroomItemBody.safeParse(req.body);
    if (!params.success || !body.success || !titleValid(body.data?.title) ||
        !validCalendarDay(body.data?.dueOn) || (body.success && !journalFieldsValid(body.data.kind, body.data))) {
      res.status(400).json({ error: "Isian Workroom atau tanggal tidak sah." }); return;
    }
    const ownerId = getAuth(req).userId!, caseId = params.data.id;
    const result = await db.transaction(async tx => {
      if (!await ownedCase(tx, caseId, ownerId)) return null;
      const [row] = await tx.insert(workroomItemsTable).values({
        ...body.data, title: body.data.title.trim(), id: randomUUID(), caseId, ownerId,
      }).returning();
      return serialize(row);
    });
    if (!result) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
    res.status(201).json(result);
  });
  router.patch("/cases/:id/workroom/:itemId", async (req, res): Promise<void> => {
    const params = UpdateWorkroomItemParams.safeParse(req.params);
    const body = UpdateWorkroomItemBody.safeParse(req.body);
    if (!params.success || !body.success || !titleValid(body.data?.title) || !validCalendarDay(body.data?.dueOn)) {
      res.status(400).json({ error: "Isian Workroom atau tanggal tidak sah." }); return;
    }
    const ownerId = getAuth(req).userId!, { id: caseId, itemId } = params.data;
    const result = await db.transaction(async tx => {
      if (!await ownedCase(tx, caseId, ownerId)) return { status: 404, error: "Kasus tidak ditemukan." };
      const condition = and(eq(workroomItemsTable.id, itemId), eq(workroomItemsTable.caseId, caseId), eq(workroomItemsTable.ownerId, ownerId));
      const [current] = await tx.select().from(workroomItemsTable).where(condition).for("update");
      if (!current) return { status: 404, error: "Catatan tidak ditemukan." };
      if (current.revision !== body.data.revision) return { status: 409, error: "Catatan sudah berubah. Muat ulang data sebelum mengubahnya." };
      if (!journalFieldsValid(current.kind, body.data)) return { status: 400, error: "Jurnal hanya berisi judul dan catatan kerja." };
      const { revision, ...fields } = body.data;
      const [row] = await tx.update(workroomItemsTable).set({
        ...fields, ...(fields.title !== undefined ? { title: fields.title.trim() } : {}),
        revision: revision + 1, updatedAt: new Date(),
      }).where(condition).returning();
      return { status: 200, item: serialize(row) };
    });
    if (result.error) res.status(result.status).json({ error: result.error });
    else res.json(result.item);
  });
  router.delete("/cases/:id/workroom/:itemId", async (req, res): Promise<void> => {
    const params = UpdateWorkroomItemParams.safeParse(req.params);
    const body = DeleteWorkroomItemBody.safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: "ID atau versi catatan tidak sah." }); return; }
    const ownerId = getAuth(req).userId!, { id: caseId, itemId } = params.data;
    const result = await db.transaction(async tx => {
      if (!await ownedCase(tx, caseId, ownerId)) return { status: 404, error: "Kasus tidak ditemukan." };
      const condition = and(eq(workroomItemsTable.id, itemId), eq(workroomItemsTable.caseId, caseId), eq(workroomItemsTable.ownerId, ownerId));
      const [row] = await tx.select().from(workroomItemsTable).where(condition).for("update");
      if (!row) return { status: 404, error: "Catatan tidak ditemukan." };
      if (row.revision !== body.data.revision) return { status: 409, error: "Catatan sudah berubah. Muat ulang sebelum menghapus." };
      await tx.delete(workroomItemsTable).where(condition);
      return { status: 204 };
    });
    if (result.error) res.status(result.status).json({ error: result.error });
    else res.status(204).end();
  });
  return router;
}
export default createWorkroomRouter();
