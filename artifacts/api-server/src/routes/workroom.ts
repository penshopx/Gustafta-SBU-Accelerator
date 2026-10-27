import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, lt, ne, or, sql } from "drizzle-orm";
import { db, casesTable, workroomItemsTable, type WorkroomItemRow } from "@workspace/db";
import {
  GetWorkroomParams, GetWorkroomResponse, CreateWorkroomItemBody,
  UpdateWorkroomItemParams, UpdateWorkroomItemBody, DeleteWorkroomItemBody,
  CreateWorkroomItemResponse,
  GetAccountAgendaQueryParams, GetAccountAgendaResponse,
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
  router.use(["/agenda", "/cases/:id/workroom"], (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const ownerId = getAuth(req).userId;
    if (!ownerId) { res.status(401).json({ error: "Silakan masuk untuk melanjutkan." }); return; }
    if (req.get("X-SBU-Form-Owner") !== ownerId) {
      res.status(409).json({ error: "Sesi akun berubah. Muat ulang halaman." }); return;
    }
    next();
  });
  router.get("/agenda", async (req, res): Promise<void> => {
    if (Object.keys(req.query).some(key => !["page", "pageSize", "filter", "search"].includes(key))) {
      res.status(400).json({ error: "Parameter agenda tidak sah." }); return;
    }
    const params = GetAccountAgendaQueryParams.safeParse(req.query);
    if (!params.success) { res.status(400).json({ error: "Parameter agenda tidak sah." }); return; }
    const ownerId = getAuth(req).userId!;
    const { page, pageSize, filter, search } = params.data;
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const today = `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
    const through = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    const item = workroomItemsTable, parent = casesTable;
    const active = ne(item.status, "done");
    const filters = {
      active,
      overdue: and(active, lt(item.dueOn, today)),
      today: and(active, eq(item.dueOn, today)),
      week: and(active, gte(item.dueOn, today), lte(item.dueOn, through)),
      undated: and(active, isNull(item.dueOn)),
      done: eq(item.status, "done"),
      all: sql`true`,
    } as const;
    // Escape LIKE wildcards: search is a literal, not a pattern or an SQL fragment.
    const term = search?.trim();
    const pattern = term ? `%${term.replace(/[\\%_]/g, "\\$&")}%` : null;
    const where = and(eq(parent.ownerId, ownerId), eq(item.ownerId, ownerId), eq(item.kind, "action"),
      filters[filter], ...(pattern ? [or(ilike(item.title, pattern), ilike(item.assignee, pattern),
        ilike(parent.companyName, pattern), ilike(parent.classification, pattern))] : []));
    const priority = sql<number>`case
      when ${item.status} = 'done' then 5
      when ${item.dueOn} is null then 4
      when ${item.dueOn} < ${today}::date then 0
      when ${item.dueOn} = ${today}::date then 1
      when ${item.dueOn} <= ${through}::date then 2
      else 3 end`;
    const result = await db.transaction(async tx => {
      const [{ total }] = await tx.select({ total: count() }).from(item)
        .innerJoin(parent, eq(item.caseId, parent.id)).where(where);
      const rows = await tx.select({
        id: item.id, caseId: item.caseId, companyName: parent.companyName,
        classification: parent.classification, title: item.title, status: item.status,
        assignee: item.assignee, dueOn: item.dueOn, revision: item.revision,
      }).from(item).innerJoin(parent, eq(item.caseId, parent.id)).where(where)
        .orderBy(priority, asc(item.dueOn), asc(item.caseId), asc(item.id))
        .limit(pageSize).offset((page - 1) * pageSize);
      return GetAccountAgendaResponse.parse({
        ownerId, today, asOf: now.toISOString(), page, pageSize, total,
        hasNext: page * pageSize < total, items: rows,
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json(result);
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
