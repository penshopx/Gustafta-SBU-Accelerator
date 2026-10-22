import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, casesTable, evidenceTable, profilesTable, transitionVerificationsTable } from "@workspace/db";
import {
  GetMeResponse, UpdateMeBody, UpdateMeResponse,
  GetDashboardResponse, ListCasesResponse, CreateCaseBody, CreateCaseResponse,
  GetCaseParams, GetCaseResponse, UpdateCaseParams, UpdateCaseBody, UpdateCaseResponse,
  DeleteCaseParams, ListEvidenceParams, ListEvidenceResponse,
  AddEvidenceParams, AddEvidenceBody, AddEvidenceResponse,
  UpdateEvidenceParams, UpdateEvidenceBody, UpdateEvidenceResponse,
  DeleteEvidenceParams, GetAssessmentParams, GetAssessmentResponse,
   ListRegulationsResponse, ListTransitionVerificationsResponse,
   PutTransitionVerificationParams, PutTransitionVerificationBody, PutTransitionVerificationResponse,
} from "@workspace/api-zod";
import { assessCase, regulationsFor, TRANSITION_TRACKS } from "../lib/sbu-rules";
import { preparationSummary } from "../lib/preparation-summary";
import { casePersonnelSnapshot } from "../lib/personnel-snapshot";
import { GetPreparationSummaryParams, GetPreparationSummaryResponse } from "@workspace/api-zod";
import { GetWorkspaceResponse } from "@workspace/api-zod";
import { getContext, recordCaseAudit, workspaceDisclaimer } from "../lib/workspace-context";
import standaloneRouter from "./standalone";
import sbuChatRouter from "./sbu-chat";
import consultationsRouter from "./consultations";
import personnelRouter from "./personnel";
import workroomRouter from "./workroom";
import workroomReviewsRouter from "./workroom-reviews";
import documentVaultRouter from "./document-vault";
import documentAnalysisRouter from "./document-analysis";

const router: IRouter = Router();
const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Silakan masuk untuk melanjutkan." });
    return;
  }
  next();
};
router.use(requireAuth);

// Bind each private read to the identity of the tab that started it. This runs
// before workspace initialization or any subrouter/database access. The header
// is only a precondition; Clerk remains the authority for resource ownership.
router.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) ||
      !/^\/(?:me|workspace|dashboard|cases|documents|personnel|company-profile|transition-verifications)(?:\/|$)/.test(req.path)) {
    next();
    return;
  }
  res.set("Cache-Control", "private, no-store");
  if (req.get("X-SBU-Form-Owner") !== owner(req)) {
    res.status(409).json({ error: "Sesi akun berubah. Muat ulang halaman sebelum membaca data privat." });
    return;
  }
  next();
});

// The cookie can change in another tab before an old form hears about it.
// This is a precondition, not authentication: ownership always comes from Clerk.
router.use((req, res, next) => {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  const formOwner = req.get("X-SBU-Form-Owner");
  if (!formOwner || formOwner !== owner(req)) {
    res.status(409).json({
      error: "Sesi akun berubah atau formulir tidak lagi sah. Muat ulang halaman sebelum menyimpan.",
    });
    return;
  }
  next();
});

router.use(standaloneRouter);
router.use(personnelRouter);
router.use(workroomRouter);
router.use(workroomReviewsRouter);
router.use(sbuChatRouter);
router.use(consultationsRouter);
router.use(documentVaultRouter);
router.use(documentAnalysisRouter);

function owner(req: Request): string {
  const id = getAuth(req).userId;
  if (!id) throw new Error("Authentication middleware was not applied");
  return id;
}

// Every case endpoint resolves the same server-owned private workspace.
// Existing Clerk owner checks stay in place; clients do not grant team access.
router.use(async (req, _res, next) => {
  if (/^\/(?:cases|dashboard)(?:\/|$)/.test(req.path)) await getContext(req);
  next();
});

router.get("/workspace", async (req, res): Promise<void> => {
  const context = await getContext(req);
  res.set("Cache-Control", "private, no-store");
  res.json(GetWorkspaceResponse.parse({
    userId: context.userId, orgId: context.orgId, role: context.role,
    clientIds: context.clientIds, clients: context.clients,
    disclaimer: await workspaceDisclaimer(),
  }));
});

// No applicant profile or self-selected role grants regulatory verification rights.
// Configure trusted Clerk user IDs on the server; without the allowlist, all writes fail closed.
const requireVerifier: RequestHandler = (req, res, next) => {
  const approved = (process.env.SBU_VERIFIER_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!approved.includes(owner(req))) {
    res.status(403).json({ error: "Hanya penelaah sumber resmi yang diizinkan." });
    return;
  }
  next();
};

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
  // OpenAPI/Orval emits RegExp without a Unicode flag; this also catches
  // supplementary-plane format characters and variation selectors that its
  // pattern cannot classify. A joiner/selector is fine beside a real character.
  const hasVisibleNameCharacter = input.success &&
    /[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(input.data.displayName);
  if (!input.success || !hasVisibleNameCharacter) {
    res.status(400).json({
      error: "Profil tidak valid.",
      detail: input.success ? "Nama harus memuat karakter yang terlihat." : input.error.message,
    });
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
    .where(eq(casesTable.ownerId, owner(req)))
    .orderBy(desc(casesTable.updatedAt), desc(casesTable.id));
  const dashboard = GetDashboardResponse.parse({
    total: items.length,
    draft: items.filter((x) => x.status === "draf").length,
    reviewing: items.filter((x) => x.status === "ditinjau").length,
    prepared: items.filter((x) => x.status === "selesai_persiapan").length,
    recent: items.slice(0, 5),
  });
  res.json({
    ...dashboard,
    // Generated parsing coerces calendar dates to Date; the wire contract is date-only.
    recent: dashboard.recent.map((item) => ({
      ...item,
      existingSbuExpiresOn: dateOnly(item.existingSbuExpiresOn),
    })),
  });
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
  const context = await getContext(req);
  const item = await db.transaction(async (tx) => {
    const [created] = await tx.insert(casesTable).values({
      ownerId: userId,
      clientId: context.defaultClientId,
      companyName: input.data.companyName,
      requestType: input.data.requestType,
      qualification: input.data.qualification,
      classification: input.data.classification,
      existingSbuExpiresOn: dateOnly(input.data.existingSbuExpiresOn),
    }).returning();
    await recordCaseAudit(context, "case.created", created.id, Object.keys(input.data), tx);
    return created;
  });
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
  if (!params.success || !input.success || Object.keys(input.data).length === 0 ||
      (input.data.existingSbuExpiresOn != null &&
       dateOnly(input.data.existingSbuExpiresOn) !== req.body.existingSbuExpiresOn)) {
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
  const context = await getContext(req);
  const item = await db.transaction(async (tx) => {
    const [updated] = await tx.update(casesTable).set(changes)
      .where(and(eq(casesTable.id, params.data.id), eq(casesTable.ownerId, userId))).returning();
    if (updated) await recordCaseAudit(context, "case.updated", updated.id, Object.keys(input.data), tx);
    return updated;
  });
  if (!item) { res.status(404).json({ error: "Permohonan tidak ditemukan." }); return; }
  res.json(UpdateCaseResponse.parse(item));
});

router.delete("/cases/:id", async (req, res): Promise<void> => {
  const params = DeleteCaseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const context = await getContext(req);
  let item;
  try {
    item = await db.transaction(async (tx) => {
      const [deleted] = await tx.delete(casesTable)
        .where(and(eq(casesTable.id, params.data.id), eq(casesTable.ownerId, context.userId))).returning();
      if (deleted) await recordCaseAudit(context, "case.deleted", deleted.id, [], tx);
      return deleted;
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error as { code?: string; constraint?: string };
    if (cause.code === "23503" && cause.constraint?.includes("sbu_documents")) {
      res.status(409).json({ error: "Hapus atau batalkan semua dokumen kasus ini terlebih dahulu sebelum menghapus kasus." }); return;
    }
    throw error;
  }
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
    .orderBy(desc(evidenceTable.updatedAt), desc(evidenceTable.id));
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
  const verifications = item.requestType === "perpanjangan"
    ? await db.select().from(transitionVerificationsTable) : [];
  res.json(GetAssessmentResponse.parse(assessCase(item, evidence, verifications)));
});

router.get("/cases/:id/preparation-summary", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  res.set("Referrer-Policy", "no-referrer");
  const params = GetPreparationSummaryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const userId = owner(req);
  if (req.get("X-SBU-Form-Owner") !== userId) {
    res.status(409).json({ error: "Sesi akun berubah. Muat ulang sebelum membuat ringkasan." }); return;
  }
  // One consistent snapshot, including the latest source revocations/approvals.
  const html = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(casesTable)
      .where(and(eq(casesTable.id, params.data.id), eq(casesTable.ownerId, userId)));
    if (!item) return null;
    const evidence = await tx.select().from(evidenceTable).where(eq(evidenceTable.caseId, item.id));
    const verifications = await tx.select().from(transitionVerificationsTable);
    const generatedAt = new Date();
    const personnel = await casePersonnelSnapshot(tx, item.id, userId, generatedAt);
    return preparationSummary(item, evidence, verifications, generatedAt, personnel);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  if (!html) { res.status(404).json({ error: "Permohonan tidak ditemukan." }); return; }
  res.set("Content-Disposition", 'attachment; filename="ringkasan-persiapan-sbu.html"');
  res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  res.set("X-Content-Type-Options", "nosniff");
  res.type("html").send(GetPreparationSummaryResponse.parse(html));
});

router.get("/transition-verifications", requireVerifier, async (_req, res): Promise<void> => {
  const records = await db.select().from(transitionVerificationsTable);
  res.json(ListTransitionVerificationsResponse.parse(records));
});

router.put("/transition-verifications/:track", requireVerifier, async (req, res): Promise<void> => {
  const params = PutTransitionVerificationParams.safeParse(req.params);
  const input = PutTransitionVerificationBody.safeParse(req.body);
  if (!params.success || !TRANSITION_TRACKS.includes(params.data.track as typeof TRANSITION_TRACKS[number]) || !input.success) {
    res.status(400).json({ error: "Verifikasi alur tidak valid." });
    return;
  }
  const data = input.data;
  // Check the exact calendar representation; do not accept rollover dates or inferred timestamps.
  const issuedOn = dateOnly(data.issuedOn);
  const expertReviewedOn = dateOnly(data.expertReviewedOn);
  if (!issuedOn || !expertReviewedOn || req.body.issuedOn !== issuedOn ||
      req.body.expertReviewedOn !== expertReviewedOn ||
      Object.values({
        publisher: data.publisher, documentNumber: data.documentNumber, signatory: data.signatory,
        scope: data.scope, expertName: data.expertName, expertOrganization: data.expertOrganization,
        expertReview: data.expertReview,
      }).some((value) => !value.trim()) ||
      (data.sourceVerified && (!data.sourceUrl.startsWith("https://") || data.documentStatus !== "berlaku"))) {
    res.status(400).json({ error: "Sumber resmi atau tanggal verifikasi tidak valid." });
    return;
  }
  const values = {
    ...data,
    issuedOn,
    expertReviewedOn,
    verifiedBy: owner(req),
    updatedAt: new Date(),
  };
  const [row] = await db.insert(transitionVerificationsTable)
    .values({ track: params.data.track, ...values })
    .onConflictDoUpdate({ target: transitionVerificationsTable.track, set: values })
    .returning();
  res.json(PutTransitionVerificationResponse.parse(row));
});

router.get("/regulations", async (_req, res): Promise<void> => {
  const verifications = await db.select().from(transitionVerificationsTable);
  res.json(ListRegulationsResponse.parse(regulationsFor(verifications)));
});

export default router;