import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, casesTable, consultationsTable, type ConsultationMessage } from "@workspace/db";
import {
  GetConsultationResponse as ConsultationResponse, ListConsultationsResponseItem as ConsultationSummaryResponse,
  CreateConsultationBody as CreateConsultationInput, RenameConsultationBody as RenameConsultationInput,
  SendConsultationMessageBody as ConsultationMessageInput, GetConsultationParams,
} from "@workspace/api-zod";
import { CHAT_DISCLAIMER, CHAT_MODES } from "../lib/sbu-chat-policy";
import { specialistCatalog, type SpecialistId } from "../lib/sbu-chat-specialists";
import { generateSbuChatAnswer } from "./sbu-chat";
import { consultationAnalysis, ConsultationSourceError, MAX_CONSULTATION_CONTEXT, sourceErrorMessage } from "../lib/consultation-analysis";

type Mode = keyof typeof CHAT_MODES;
type Generate = typeof generateSbuChatAnswer;
const validId = (value: unknown) => GetConsultationParams.safeParse({ id: value }).success;
const modes = Object.keys(CHAT_MODES);
const specialists = new Set(specialistCatalog().map(s => s.id));

function serialize(row: typeof consultationsTable.$inferSelect) {
  return ConsultationResponse.parse({
    ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    disclaimer: CHAT_DISCLAIMER,
  });
}
function summary(row: typeof consultationsTable.$inferSelect) {
  return ConsultationSummaryResponse.parse({
    id: row.id, title: row.title, mode: row.mode, specialist: row.specialist,
    caseId: row.caseId, revision: row.revision,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
}

export function createConsultationsRouter(generate: Generate = generateSbuChatAnswer): IRouter {
  const router: IRouter = Router();
  const slots = new Map<string, { since: number; count: number; busy: boolean }>();
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    // The parent router already requires Clerk, but keep this subrouter safe by itself.
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Silakan masuk untuk membuka konsultasi." }); return; }
    if (req.get("X-SBU-Form-Owner") !== userId) {
      res.status(409).json({ error: "Sesi akun berubah. Muat ulang halaman." }); return;
    }
    next();
  });
  const find = async (id: string, ownerId: string) => {
    const [row] = await db.select().from(consultationsTable)
      .where(and(eq(consultationsTable.id, id), eq(consultationsTable.ownerId, ownerId))).limit(1);
    return row;
  };

  router.get("/consultations", async (req, res) => {
    const rows = await db.select().from(consultationsTable).where(eq(consultationsTable.ownerId, getAuth(req).userId!))
      .orderBy(desc(consultationsTable.updatedAt), desc(consultationsTable.id)).limit(100);
    res.json(rows.map(summary));
  });
  router.post("/consultations", async (req, res) => {
    const input = CreateConsultationInput.safeParse(req.body);
    if (!input.success || !input.data.title.trim() || !modes.includes(input.data.mode) ||
        !specialists.has(input.data.specialist) ||
        (input.data.includeCaseContext && (!input.data.caseId || !input.data.expectedCaseContext)) ||
        (!input.data.includeCaseContext && !!input.data.expectedCaseContext) ||
        (input.data.analysisSelection && !input.data.caseId) ||
        Object.keys(req.body ?? {}).some(key => !["title", "mode", "specialist", "caseId", "includeCaseContext", "expectedCaseContext", "analysisSelection"].includes(key))) {
      res.status(400).json({ error: "Isi judul, peran, spesialis, dan pilih persetujuan konteks kasus yang sesuai." }); return;
    }
    const ownerId = getAuth(req).userId!;
    let context = "";
    if (input.data.caseId) {
      const [selected] = await db.select({
        id: casesTable.id, companyName: casesTable.companyName, requestType: casesTable.requestType,
        classification: casesTable.classification, qualification: casesTable.qualification, status: casesTable.status,
      }).from(casesTable).where(and(eq(casesTable.id, input.data.caseId), eq(casesTable.ownerId, ownerId))).limit(1);
      if (!selected) { res.status(404).json({ error: "Kasus tidak ditemukan." }); return; }
      // Only the fields explicitly previewed in the UI; no evidence, company profile or documents.
      if (input.data.includeCaseContext) {
        const { id: _id, ...preview } = selected;
        if (JSON.stringify(preview) !== JSON.stringify(input.data.expectedCaseContext)) {
          res.status(409).json({ error: "Kasus berubah setelah pratinjau. Muat ulang daftar kasus sebelum memberi izin konteks." }); return;
        }
        context = JSON.stringify(selected);
      }
    }
    if (input.data.analysisSelection) {
      const selection = input.data.analysisSelection;
      try {
        const preview = await consultationAnalysis(input.data.caseId!, selection.documentId, selection.analysisId, ownerId);
        if (selection.revision !== preview.revision || !selection.excerpt.trim() || !preview.text.includes(selection.excerpt)) {
          res.status(409).json({ error: "Hasil atau cuplikan berubah. Tinjau ulang dan setujui cuplikan persis sebelum membuat konsultasi." }); return;
        }
        const { text: _text, ...reference } = preview;
        context = JSON.stringify({
          ...(context ? { caseContext: JSON.parse(context) } : {}),
          analysisSnapshot: { ...reference, excerpt: selection.excerpt },
        });
      } catch (error) {
        if (!(error instanceof ConsultationSourceError)) throw error;
        res.status(error.status).json({ error: sourceErrorMessage() }); return;
      }
    }
    if (context.length > MAX_CONSULTATION_CONTEXT) {
      res.status(400).json({ error: "Konteks maksimal 8.000 karakter. Kurangi cuplikan." }); return;
    }
    const [count] = await db.select({ count: sql<number>`count(*)::integer` }).from(consultationsTable)
      .where(eq(consultationsTable.ownerId, ownerId));
    if ((count?.count ?? 0) >= 100) {
      res.status(409).json({ error: "Batas 100 konsultasi tercapai. Hapus konsultasi lama sebelum membuat yang baru." }); return;
    }
    const [row] = await db.insert(consultationsTable).values({
      id: randomUUID(), ownerId, title: input.data.title.trim(), mode: input.data.mode,
      specialist: input.data.specialist, caseId: input.data.caseId ?? null, context,
    }).returning();
    res.status(201).json(serialize(row));
  });
  router.get("/consultations/:id", async (req, res) => {
    if (!validId(req.params.id)) { res.status(404).json({ error: "Konsultasi tidak ditemukan." }); return; }
    const row = await find(req.params.id as string, getAuth(req).userId!);
    if (!row) { res.status(404).json({ error: "Konsultasi tidak ditemukan." }); return; }
    res.json(serialize(row));
  });
  router.patch("/consultations/:id", async (req, res) => {
    const input = RenameConsultationInput.safeParse(req.body);
    if (!validId(req.params.id) || !input.success || !input.data.title.trim()) {
      res.status(400).json({ error: "Judul konsultasi tidak valid." }); return;
    }
    const [row] = await db.update(consultationsTable).set({ title: input.data.title.trim(), updatedAt: new Date() })
      .where(and(eq(consultationsTable.id, req.params.id as string),
        eq(consultationsTable.ownerId, getAuth(req).userId!))).returning();
    if (!row) { res.status(404).json({ error: "Konsultasi tidak ditemukan." }); return; }
    res.json(serialize(row));
  });
  router.delete("/consultations/:id", async (req, res) => {
    if (!validId(req.params.id)) { res.status(404).json({ error: "Konsultasi tidak ditemukan." }); return; }
    const [row] = await db.delete(consultationsTable)
      .where(and(eq(consultationsTable.id, req.params.id as string),
        eq(consultationsTable.ownerId, getAuth(req).userId!))).returning({ id: consultationsTable.id });
    if (!row) { res.status(404).json({ error: "Konsultasi tidak ditemukan." }); return; }
    res.status(204).end();
  });
  router.post("/consultations/:id/messages", async (req, res) => {
    const input = ConsultationMessageInput.safeParse(req.body);
    if (!validId(req.params.id) || !input.success || !input.data.content.trim() ||
        input.data.consent !== true || input.data.content.trim().length > 4000) {
      res.status(400).json({ error: "Tulis pertanyaan yang sah dan setujui pengiriman ke penyedia AI." }); return;
    }
    const ownerId = getAuth(req).userId!;
    const row = await find(req.params.id as string, ownerId);
    if (!row) { res.status(404).json({ error: "Konsultasi tidak ditemukan." }); return; }
    if (row.messages.some(m => m.requestId === input.data.requestId)) {
      res.json(serialize(row)); return;
    }
    if (row.revision !== input.data.revision) {
      res.status(409).json({ error: "Percakapan berubah. Muat ulang konsultasi sebelum mengirim lagi." }); return;
    }
    if (row.messages.length >= 40) {
      res.status(409).json({ error: "Percakapan mencapai 20 pasang pesan. Mulai konsultasi baru." }); return;
    }
    // A snapshot is retained for review, but it does not grant continuing access
    // to deleted, transferred, quarantined or superseded source material.
    if (row.context.length > MAX_CONSULTATION_CONTEXT ||
        row.messages.slice(-18).reduce((sum, m) => sum + m.content.length, row.context.length + input.data.content.length) > 48000) {
      res.status(400).json({ error: "Konteks percakapan terlalu panjang. Mulai konsultasi baru dengan cuplikan lebih singkat." }); return;
    }
    const snapshot = row.context ? JSON.parse(row.context).analysisSnapshot : undefined;
    if (snapshot) {
      try {
        const current = await consultationAnalysis(snapshot.caseId, snapshot.documentId, snapshot.analysisId, ownerId);
        if (current.revision !== snapshot.revision) throw new ConsultationSourceError(409);
      } catch (error) {
        if (!(error instanceof ConsultationSourceError)) throw error;
        res.status(error.status).json({ error: sourceErrorMessage() }); return;
      }
    }
    const now = Date.now();
    for (const [id, slot] of slots) if (!slot.busy && now - slot.since >= 60_000) slots.delete(id);
    let slot = slots.get(ownerId);
    if (!slot) {
      if (slots.size >= 1000) { res.status(503).json({ error: "Klinik sedang sibuk. Coba lagi." }); return; }
      slot = { since: now, count: 0, busy: false }; slots.set(ownerId, slot);
    } else if (!slot.busy && now - slot.since >= 60_000) { slot.since = now; slot.count = 0; }
    if (slot.busy || slot.count >= 6) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "Tunggu jawaban sebelumnya atau coba lagi dalam satu menit." }); return;
    }
    slot.busy = true; slot.count++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    try {
      const content = input.data.content.trim();
      const history = row.messages.slice(-18).map(m => ({ role: m.role, content: m.content }));
      const answer = await Promise.race([
        generate(row.mode as Mode, [...history, { role: "user", content }], controller.signal, row.specialist as SpecialistId, row.context),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })),
      ]);
      if (!answer.trim() || answer.length > 12000) throw new Error("invalid_ai_answer");
      const at = new Date().toISOString();
      const messages: ConsultationMessage[] = [
        ...row.messages,
        { id: randomUUID(), role: "user", content, createdAt: at, requestId: input.data.requestId },
        { id: randomUUID(), role: "assistant", content: answer.trim(), createdAt: at },
      ];
      const [saved] = await db.update(consultationsTable).set({
        messages, revision: row.revision + 1, updatedAt: new Date(),
      }).where(and(eq(consultationsTable.id, row.id), eq(consultationsTable.ownerId, ownerId),
        eq(consultationsTable.revision, row.revision))).returning();
      if (!saved) {
        if (!res.destroyed) res.status(409).json({ error: "Percakapan berubah selama pemrosesan. Muat ulang; periksa apakah jawaban sudah tersimpan sebelum mencoba lagi." });
        return;
      }
      if (!res.destroyed) res.json(serialize(saved));
    } catch {
      // Never log private questions or provider payloads. No user message is saved on AI failure.
      if (!res.destroyed) res.status(503).json({ error: "Jawaban belum tersedia; pertanyaan belum disimpan. Periksa riwayat sebelum mencoba lagi." });
    } finally {
      clearTimeout(timer); res.off("close", disconnect); slot.busy = false;
    }
  });
  return router;
}
export default createConsultationsRouter();
