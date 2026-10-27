import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, casesTable, documentsTable, smapChecklistRevisionsTable as revisions } from "@workspace/db";
import {
  GetSmapChecklistParams, GetSmapChecklistResponse, GetSmapChecklistHistoryParams,
  GetSmapChecklistHistoryResponse, SaveSmapChecklistEntryParams, SaveSmapChecklistEntryBody,
  SaveSmapChecklistEntryResponse as Entry, ReviewSmapChecklistEntryBody,
} from "@workspace/api-zod";
import { SMAP_TEMPLATE, SMAP_DISCLAIMER, smapQuestions, smapDocuments } from "../lib/smap-checklist";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RecordEntry = ReturnType<typeof Entry.parse>;
const scope = (caseId: number, ownerId: string) => and(eq(revisions.caseId, caseId),
  eq(revisions.ownerId, ownerId), eq(revisions.templateVersion, SMAP_TEMPLATE));
const outdated = (entry: RecordEntry, docs: ReturnType<typeof smapDocuments>) =>
  entry.evidence.some(e => !docs.some(d => d.id === e.id && d.fingerprint === e.fingerprint));
const serialize = (record: unknown, docs: ReturnType<typeof smapDocuments>) => {
  const entry = Entry.parse(record);
  return { ...entry, needsReview: outdated(entry, docs) };
};
async function caseDocuments(tx: Tx, caseId: number, ownerId: string) {
  return smapDocuments(await tx.select().from(documentsTable)
    .where(and(eq(documentsTable.caseId, caseId), eq(documentsTable.ownerId, ownerId))).for("share"));
}
const bad = (status: number, error: string) => ({ status, error });

export function createSmapChecklistRouter(): IRouter {
  const router = Router();
  router.use("/cases/:id/smap-checklist", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const owner = getAuth(req).userId;
    if (!owner) { res.status(401).json({ error: "Silakan masuk untuk melanjutkan." }); return; }
    if (req.get("X-SBU-Form-Owner") !== owner) {
      res.status(409).json({ error: "Sesi akun berubah. Muat ulang halaman." }); return;
    }
    next();
  });
  router.get("/cases/:id/smap-checklist", async (req, res): Promise<void> => {
    const params = GetSmapChecklistParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "ID kasus tidak sah." }); return; }
    const { id } = params.data, owner = getAuth(req).userId!;
    const data = await db.transaction(async tx => {
      const [parent] = await tx.select({ id: casesTable.id }).from(casesTable)
        .where(and(eq(casesTable.id, id), eq(casesTable.ownerId, owner)));
      if (!parent) return null;
      // No locks in this repeatable-read snapshot: documents and declarations
      // must be read from the same snapshot, not mixed across commits.
      const docs = smapDocuments(await tx.select().from(documentsTable)
        .where(and(eq(documentsTable.caseId, id), eq(documentsTable.ownerId, owner))));
      const rows = await tx.selectDistinctOn([revisions.questionId]).from(revisions)
        .where(scope(id, owner)).orderBy(asc(revisions.questionId), desc(revisions.revision));
      return GetSmapChecklistResponse.parse({
        caseId: id, templateVersion: SMAP_TEMPLATE, disclaimer: SMAP_DISCLAIMER,
        questions: smapQuestions, documents: docs, entries: rows.map(r => serialize(r.record, docs)),
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if (!data) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
    res.json(data);
  });
  router.get("/cases/:id/smap-checklist/:questionId/history", async (req, res): Promise<void> => {
    const parsed = GetSmapChecklistHistoryParams.safeParse(req.params);
    if (!parsed.success || !smapQuestions.some(q => q.id === parsed.data.questionId)) {
      res.status(400).json({ error: "Butir checklist tidak sah." }); return;
    }
    const { id, questionId } = parsed.data, owner = getAuth(req).userId!;
    const data = await db.transaction(async tx => {
      const [parent] = await tx.select({ id: casesTable.id }).from(casesTable)
        .where(and(eq(casesTable.id, id), eq(casesTable.ownerId, owner)));
      if (!parent) return null;
      const docs = smapDocuments(await tx.select().from(documentsTable)
        .where(and(eq(documentsTable.caseId, id), eq(documentsTable.ownerId, owner))));
      const rows = await tx.select().from(revisions)
        .where(and(scope(id, owner), eq(revisions.questionId, questionId)))
        .orderBy(desc(revisions.revision)).limit(50);
      return GetSmapChecklistHistoryResponse.parse(rows.map(r => serialize(r.record, docs)));
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if (!data) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
    res.json(data);
  });
  const write = (review: boolean) => async (req: Request, res: Response): Promise<void> => {
    const params = SaveSmapChecklistEntryParams.safeParse(req.params);
    // Generated parsers strip unknown fields by default; be strict on writes.
    const declaration = !review ? SaveSmapChecklistEntryBody.strict().safeParse(req.body) : null;
    const decision = review ? ReviewSmapChecklistEntryBody.strict().safeParse(req.body) : null;
    if (!params.success || !smapQuestions.some(q => q.id === params.data.questionId) ||
      (!declaration?.success && !decision?.success)) {
      res.status(400).json({ error: "Isian checklist tidak sah." }); return;
    }
    const { id, questionId } = params.data, owner = getAuth(req).userId!;
    const result = await db.transaction(async tx => {
      // Serialize writes, including first insert, across instances. No lock is
      // held while calling storage, AI or another external service.
      const [parent] = await tx.select({ id: casesTable.id }).from(casesTable)
        .where(and(eq(casesTable.id, id), eq(casesTable.ownerId, owner))).for("update");
      if (!parent) return bad(404, "Kasus tidak ditemukan.");
      const [last] = await tx.select().from(revisions)
        .where(and(scope(id, owner), eq(revisions.questionId, questionId)))
        .orderBy(desc(revisions.revision)).limit(1);
      const inputRevision = declaration?.success ? declaration.data.revision : decision?.success ? decision.data.revision : -1;
      if ((last?.revision ?? 0) !== inputRevision) return bad(409, "Butir sudah berubah. Muat ulang sebelum menyimpan.");
      const docs = await caseDocuments(tx, id, owner);
      const now = new Date().toISOString();
      let entry: RecordEntry;
      if (declaration?.success) {
        const body = declaration.data;
        if (new Set(body.evidence.map(e => e.id)).size !== body.evidence.length) return bad(400, "Bukti yang sama dipilih berulang.");
        const evidence = body.evidence.map(e => docs.find(d => d.id === e.id && d.fingerprint === e.fingerprint));
        if (evidence.some(e => !e)) return bad(409, "Bukti berubah atau tidak tersedia pada kasus ini. Muat ulang daftar dokumen.");
        entry = Entry.parse({
          questionId, revision: inputRevision + 1, answer: body.answer, notes: body.notes,
          evidence, reviewStatus: "unreviewed", reviewNote: "", reviewedBy: null,
          reviewedAt: null, savedAt: now, needsReview: false,
        });
      } else if (decision?.success && last) {
        const previous = Entry.parse(last.record), body = decision.data;
        if (!body.note.trim()) return bad(400, "Catatan telaah harus diisi.");
        if (outdated(previous, docs)) return bad(409, "Bukti berubah. Simpan ulang deklarasi dan tautan bukti sebelum menelaah.");
        if (body.status === "adequate" && (previous.answer === "unanswered" || !previous.evidence.length))
          return bad(400, "Telaah memadai memerlukan jawaban dan bukti tersimpan.");
        entry = Entry.parse({ ...previous, revision: inputRevision + 1,
          reviewStatus: body.status, reviewNote: body.note.trim(), reviewedBy: owner,
          reviewedAt: now, savedAt: now, needsReview: false });
      } else return bad(400, "Simpan deklarasi sebelum menelaah.");
      await tx.insert(revisions).values({
        id: randomUUID(), caseId: id, ownerId: owner, templateVersion: SMAP_TEMPLATE,
        questionId, revision: entry.revision, record: entry,
      });
      return { status: 200, entry };
    });
    if ("error" in result) res.status(result.status).json({ error: result.error });
    else res.json(result.entry);
  };
  router.put("/cases/:id/smap-checklist/:questionId", write(false));
  router.post("/cases/:id/smap-checklist/:questionId/review", write(true));
  return router;
}
export default createSmapChecklistRouter();
