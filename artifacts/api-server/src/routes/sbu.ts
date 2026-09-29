import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, casesTable, evidenceTable, profilesTable } from "@workspace/db";
import {
  GetMeResponse, UpdateMeBody, UpdateMeResponse,
  GetDashboardResponse, ListCasesResponse, CreateCaseBody, CreateCaseResponse,
  GetCaseParams, GetCaseResponse, UpdateCaseParams, UpdateCaseBody, UpdateCaseResponse,
  DeleteCaseParams, ListEvidenceParams, ListEvidenceResponse,
  AddEvidenceParams, AddEvidenceBody, AddEvidenceResponse,
  UpdateEvidenceParams, UpdateEvidenceBody, UpdateEvidenceResponse,
  DeleteEvidenceParams, GetAssessmentParams, GetAssessmentResponse,
  ListRegulationsResponse,
} from "@workspace/api-zod";
import { assessCase, REGULATIONS } from "../lib/sbu-rules";

const router: IRouter = Router();
const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Silakan masuk untuk melanjutkan." });
    return;
  }
  next();
};
router.use(requireAuth);

function owner(req: Request): string {
  const id = getAuth(req).userId;
  if (!id) throw new Error("Authentication middleware was not applied");
  return id;
}

async function profileFor(userId: string) {
  await db.insert(profilesTable).values({ userId }).onConflictDoNothing();
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
  return profile;
}

async function ownedCase(id: number, userId: string) {
  const [item] = await db.select().from(casesTable)
    .where(and(eq(casesTable.id, id), eq(casesTable.ownerId, userId)));
  return item;
}

function dateOnly(value: Date | null | undefined) {
  return value == null ? null : value.toISOString().slice(0, 10);
}

router.get("/me", async (req, res): Promise<void> => {
  const profile = await profileFor(owner(req));
  res.json(GetMeResponse.parse(profile));
});

router.patch("/me", async (req, res): Promise<void> => {
  const input = UpdateMeBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Profil tidak valid.", detail: input.error.message });
    return;
  }
  const userId = owner(req);
  const [profile] = await db.insert(profilesTable)
    .values({ userId, ...input.data })
    .onConflictDoUpdate({ target: profilesTable.userId, set: input.data })
    .returning();
  res.json(UpdateMeResponse.parse(profile));
});

router.get("/dashboard", async (req, res): Promise<void> => {
  const items = await db.select().from(casesTable)
    .where(eq(casesTable.ownerId, owner(req))).orderBy(desc(casesTable.updatedAt));
  res.json(GetDashboardResponse.parse({
    total: items.length,
    draft: items.filter((x) => x.status === "draf").length,
    reviewing: items.filter((x) => x.status === "ditinjau").length,
    prepared: items.filter((x) => x.status === "selesai_persiapan").length,
    recent: items.slice(0, 5),
  }));
});

router.get("/cases", async (req, res): Promise<void> => {
  const items = await db.select().from(casesTable)
    .where(eq(casesTable.ownerId, owner(req)))
    .orderBy(desc(casesTable.updatedAt), desc(casesTable.id));
  res.json(ListCasesResponse.parse(items));
});

router.post("/cases", async (req, res): Promise<void> => {
  const input = CreateCaseBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Data permohonan tidak valid.", detail: input.error.message });
    return;
  }
  const userId = owner(req);
  const profile = await profileFor(userId);
  if (!["kontraktor", "konsultan"].includes(profile.role)) {
    res.status(403).json({ error: "Ruang kerja SBU saat ini tersedia untuk peran kontraktor dan konsultan." });
    return;
  }
  const [item] = await db.insert(casesTable).values({
    ownerId: userId,
    companyName: input.data.companyName,
    requestType: input.data.requestType,
    qualification: input.data.qualification,
    classification: input.data.classification,
    existingSbuExpiresOn: dateOnly(input.data.existingSbuExpiresOn),
  }).returning();
  res.status(201).json(CreateCaseResponse.parse(item));
});

router.get("/cases/:id", async (req, res): Promise<void> => {
  const params = GetCaseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const item = await ownedCase(params.data.id, owner(req));
  if (!item) { res.status(404).json({ error: "Permohonan tidak ditemukan." }); return; }
  res.json(GetCaseResponse.parse(item));
});

router.patch("/cases/:id", async (req, res): Promise<void> => {
  const params = UpdateCaseParams.safeParse(req.params);
  const input = UpdateCaseBody.safeParse(req.body);
  if (!params.success || !input.success || Object.keys(input.data).length === 0) {
    res.status(400).json({ error: "Perubahan tidak valid." });
    return;
  }
  const userId = owner(req);
  if (!await ownedCase(params.data.id, userId)) {
    res.status(404).json({ error: "Permohonan tidak ditemukan." });
    return;
  }
  const { existingSbuExpiresOn, ...rest } = input.data;
  const changes = {
    ...rest,
    ...(existingSbuExpiresOn !== undefined ? { existingSbuExpiresOn: dateOnly(existingSbuExpiresOn) } : {}),
    updatedAt: new Date(),
  };
  const [item] = await db.update(casesTable).set(changes)
    .where(and(eq(casesTable.id, params.data.id), eq(casesTable.ownerId, userId))).returning();
  res.json(UpdateCaseResponse.parse(item));
});

router.delete("/cases/:id", async (req, res): Promise<void> => {
  const params = DeleteCaseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [item] = await db.delete(casesTable)
    .where(and(eq(casesTable.id, params.data.id), eq(casesTable.ownerId, owner(req)))).returning();
  if (!item) { res.status(404).json({ error: "Permohonan tidak ditemukan." }); return; }
  res.sendStatus(204);
});

router.get("/cases/:id/evidence", async (req, res): Promise<void> => {
  const params = ListEvidenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID tidak valid." }); return; }
  if (!await ownedCase(params.data.id, owner(req))) {
    res.status(404).json({ error: "Permohonan tidak ditemukan." }); return;
  }
  const items = await db.select().from(evidenceTable).where(eq(evidenceTable.caseId, params.data.id))
    .orderBy(desc(evidenceTable.updatedAt));
  res.json(ListEvidenceResponse.parse(items));
});

router.post("/cases/:id/evidence", async (req, res): Promise<void> => {
  const params = AddEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Keterangan bukti tidak valid." }); return;
  }
  if (!await ownedCase(params.data.id, owner(req))) {
    res.status(404).json({ error: "Permohonan tidak ditemukan." }); return;
  }
  const input = AddEvidenceBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Keterangan bukti tidak valid." }); return;
  }
  const [item] = await db.insert(evidenceTable)
    .values({
      caseId: params.data.id,
      code: input.data.code,
      title: input.data.title,
      note: input.data.note,
    })
    .onConflictDoNothing().returning();
  if (!item) { res.status(409).json({ error: "Kategori bukti sudah dicatat. Edit catatan sebelumnya." }); return; }
  res.status(201).json(AddEvidenceResponse.parse(item));
});

router.patch("/cases/:id/evidence/:evidenceId", async (req, res): Promise<void> => {
  const params = UpdateEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Perubahan bukti tidak valid." }); return;
  }
  if (!await ownedCase(params.data.id, owner(req))) {
    res.status(404).json({ error: "Permohonan tidak ditemukan." }); return;
  }
  const input = UpdateEvidenceBody.safeParse(req.body);
  if (!input.success || Object.keys(input.data).length === 0) {
    res.status(400).json({ error: "Perubahan bukti tidak valid." }); return;
  }
  const { title, note } = input.data;
  const [item] = await db.update(evidenceTable).set({
    ...(title !== undefined ? { title } : {}),
    ...(note !== undefined ? { note } : {}),
    updatedAt: new Date(),
  })
    .where(and(eq(evidenceTable.id, params.data.evidenceId), eq(evidenceTable.caseId, params.data.id)))
    .returning();
  if (!item) { res.status(404).json({ error: "Catatan bukti tidak ditemukan." }); return; }
  res.json(UpdateEvidenceResponse.parse(item));
});

router.delete("/cases/:id/evidence/:evidenceId", async (req, res): Promise<void> => {
  const params = DeleteEvidenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID tidak valid." }); return; }
  if (!await ownedCase(params.data.id, owner(req))) {
    res.status(404).json({ error: "Permohonan tidak ditemukan." }); return;
  }
  const [item] = await db.delete(evidenceTable)
    .where(and(eq(evidenceTable.id, params.data.evidenceId), eq(evidenceTable.caseId, params.data.id))).returning();
  if (!item) { res.status(404).json({ error: "Catatan bukti tidak ditemukan." }); return; }
  res.sendStatus(204);
});

router.get("/cases/:id/assessment", async (req, res): Promise<void> => {
  const params = GetAssessmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const item = await ownedCase(params.data.id, owner(req));
  if (!item) { res.status(404).json({ error: "Permohonan tidak ditemukan." }); return; }
  const evidence = await db.select().from(evidenceTable).where(eq(evidenceTable.caseId, item.id));
  res.json(GetAssessmentResponse.parse(assessCase(item, evidence)));
});

router.get("/regulations", async (_req, res): Promise<void> => {
  res.json(ListRegulationsResponse.parse(REGULATIONS));
});

export default router;