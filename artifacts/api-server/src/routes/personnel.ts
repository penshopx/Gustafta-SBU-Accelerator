import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { db, casesTable, documentsTable, personnelTable, skkCertificatesTable, type PersonnelRow } from "@workspace/db";
import {
  CreatePersonnelBody, UpdatePersonnelBody, CreateSkkCertificateBody, UpdateSkkCertificateBody,
  GetPersonnelParams, UpdateSkkCertificateParams, GetPersonnelResponse,
} from "@workspace/api-zod";
import { declaredDateStatus, jakartaToday, validCalendarDay } from "../lib/skk-calendar";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Source = Pick<typeof db, "select">;
type Result = { status: number; error?: string; person?: unknown };
const cleanRequired = (value: unknown) => typeof value === "string" && value.trim().length > 0 && !/[\p{Cc}\p{Cf}]/u.test(value);
const fail = (status: number, error: string): Result => ({ status, error });
function reply(res: Response, result: Result) {
  if (result.status === 204) res.status(204).end();
  else if (result.error) res.status(result.status).json({ error: result.error });
  else res.status(result.status).json(result.person);
}
async function serialize(source: Source, person: PersonnelRow, today = jakartaToday()) {
  const certificates = await source.select({
    ...getTableColumns(skkCertificatesTable), documentName: documentsTable.name,
    documentCaseId: documentsTable.caseId, documentStatus: documentsTable.status, documentScanStatus: documentsTable.scanStatus,
  }).from(skkCertificatesTable).leftJoin(documentsTable,
    and(eq(documentsTable.id, skkCertificatesTable.documentId), eq(documentsTable.ownerId, person.ownerId)))
    .where(eq(skkCertificatesTable.personnelId, person.id))
    .orderBy(desc(skkCertificatesTable.updatedAt), desc(skkCertificatesTable.id));
  return GetPersonnelResponse.parse({
    ...person, createdAt: person.createdAt.toISOString(), updatedAt: person.updatedAt.toISOString(), asOfDate: today,
    certificates: certificates.map(c => ({
      ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
      documentAvailable: c.documentStatus === "ready" && c.documentScanStatus === "clean",
      ...declaredDateStatus(c.issuedOn, c.expiresOn, today),
    })),
  });
}
async function ownedCase(tx: Tx, caseId: number | null | undefined, ownerId: string) {
  if (caseId == null) return true;
  const rows = await tx.select({ id: casesTable.id }).from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.ownerId, ownerId))).for("share");
  return rows.length > 0;
}
async function checkDocument(tx: Tx, documentId: string | null | undefined, caseId: number | null, ownerId: string): Promise<Result | null> {
  if (documentId == null) return null;
  const [doc] = await tx.select().from(documentsTable)
    .where(and(eq(documentsTable.id, documentId), eq(documentsTable.ownerId, ownerId))).for("share");
  if (!doc) return fail(404, "Dokumen pendukung tidak ditemukan.");
  if (doc.status !== "ready" || doc.scanStatus !== "clean") return fail(400, "Dokumen belum siap atau belum lolos pemindaian keamanan.");
  if (caseId !== null && doc.caseId !== caseId) return fail(400, "Dokumen pendukung harus berasal dari kasus personel yang sama.");
  return null;
}
function validDates(data: { issuedOn?: string | null; expiresOn?: string | null }) {
  return validCalendarDay(data.issuedOn) && validCalendarDay(data.expiresOn) &&
    (!data.issuedOn || !data.expiresOn || data.issuedOn <= data.expiresOn);
}

export function createPersonnelRouter(): IRouter {
  const router: IRouter = Router();
  router.use("/personnel", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const ownerId = getAuth(req).userId;
    if (!ownerId) { res.status(401).json({ error: "Silakan masuk untuk melanjutkan." }); return; }
    if (req.get("X-SBU-Form-Owner") !== ownerId) {
      res.status(409).json({ error: "Sesi akun berubah. Muat ulang halaman." }); return;
    }
    next();
  });
  const owned = async (tx: Tx, id: string, ownerId: string) => {
    const [person] = await tx.select().from(personnelTable)
      .where(and(eq(personnelTable.id, id), eq(personnelTable.ownerId, ownerId))).for("update");
    return person;
  };
  router.get("/personnel", async (req, res): Promise<void> => {
    const result = await db.transaction(async tx => {
      const people = await tx.select().from(personnelTable).where(eq(personnelTable.ownerId, getAuth(req).userId!))
        .orderBy(desc(personnelTable.updatedAt), desc(personnelTable.id));
      // One repeatable snapshot keeps person/certificate reads mutually consistent.
      const today = jakartaToday();
      return Promise.all(people.map(p => serialize(tx, p, today)));
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json(result);
  });
  router.get("/personnel/:personnelId", async (req, res): Promise<void> => {
    const params = GetPersonnelParams.safeParse(req.params);
    if (!params.success) { reply(res, fail(404, "Personel tidak ditemukan.")); return; }
    const result = await db.transaction(async tx => {
      const [person] = await tx.select().from(personnelTable)
        .where(and(eq(personnelTable.id, params.data.personnelId), eq(personnelTable.ownerId, getAuth(req).userId!)));
      return person ? { status: 200, person: await serialize(tx, person) } : fail(404, "Personel tidak ditemukan.");
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    reply(res, result);
  });
  router.post("/personnel", async (req, res): Promise<void> => {
    const input = CreatePersonnelBody.safeParse(req.body);
    if (!input.success || !cleanRequired(input.data.fullName)) { reply(res, fail(400, "Isi nama personel yang terlihat dan peran yang sesuai.")); return; }
    const result = await db.transaction(async tx => {
      const ownerId = getAuth(req).userId!;
      if (!await ownedCase(tx, input.data.caseId, ownerId)) return fail(404, "Kasus tidak ditemukan.");
      const [person] = await tx.insert(personnelTable).values({
        ...input.data, fullName: input.data.fullName.trim(), ownerId, id: randomUUID(),
      }).returning();
      return { status: 201, person: await serialize(tx, person) };
    });
    reply(res, result);
  });
  router.patch("/personnel/:personnelId", async (req, res): Promise<void> => {
    const params = GetPersonnelParams.safeParse(req.params);
    const input = UpdatePersonnelBody.safeParse(req.body);
    if (!params.success) { reply(res, fail(404, "Personel tidak ditemukan.")); return; }
    if (!input.success || (input.data.fullName !== undefined && !cleanRequired(input.data.fullName))) { reply(res, fail(400, "Isian personel tidak valid.")); return; }
    const { expectedRevision, ...changes } = input.data;
    const result = await db.transaction(async tx => {
      const ownerId = getAuth(req).userId!;
      const person = await owned(tx, params.data.personnelId, ownerId);
      if (!person) return fail(404, "Personel tidak ditemukan.");
      if (person.revision !== expectedRevision) return fail(409, "Data personel berubah. Muat ulang sebelum menyunting kembali.");
      if (changes.caseId !== undefined) {
        if (!await ownedCase(tx, changes.caseId, ownerId)) return fail(404, "Kasus tidak ditemukan.");
        if (changes.caseId !== null) {
          const links = await tx.select({ documentId: skkCertificatesTable.documentId }).from(skkCertificatesTable)
            .where(eq(skkCertificatesTable.personnelId, person.id));
          for (const link of links) {
            const error = await checkDocument(tx, link.documentId, changes.caseId, ownerId);
            if (error) return error;
          }
        }
      }
      const [updated] = await tx.update(personnelTable).set({
        ...changes, ...(changes.fullName !== undefined ? { fullName: changes.fullName.trim() } : {}),
        revision: person.revision + 1, updatedAt: new Date(),
      }).where(eq(personnelTable.id, person.id)).returning();
      return { status: 200, person: await serialize(tx, updated) };
    });
    reply(res, result);
  });
  router.delete("/personnel/:personnelId", async (req, res): Promise<void> => {
    const params = GetPersonnelParams.safeParse(req.params);
    if (!params.success) { reply(res, fail(404, "Personel tidak ditemukan.")); return; }
    const rows = await db.delete(personnelTable)
      .where(and(eq(personnelTable.id, params.data.personnelId), eq(personnelTable.ownerId, getAuth(req).userId!))).returning({ id: personnelTable.id });
    reply(res, rows.length ? { status: 204 } : fail(404, "Personel tidak ditemukan."));
  });
  router.post("/personnel/:personnelId/certificates", async (req, res): Promise<void> => {
    const params = GetPersonnelParams.safeParse(req.params);
    const input = CreateSkkCertificateBody.safeParse(req.body);
    if (!params.success) { reply(res, fail(404, "Personel tidak ditemukan.")); return; }
    if (!input.success || !validDates(input.data) ||
        ![input.data.certificateNumber, input.data.issuer, input.data.jobTitle].every(cleanRequired)) {
      reply(res, fail(400, "Isi nomor, penerbit, jabatan, dan tanggal kalender yang valid. Tanggal berakhir tidak boleh mendahului tanggal terbit.")); return;
    }
    const result = await db.transaction(async tx => {
      const ownerId = getAuth(req).userId!;
      const person = await owned(tx, params.data.personnelId, ownerId);
      if (!person) return fail(404, "Personel tidak ditemukan.");
      const error = await checkDocument(tx, input.data.documentId, person.caseId, ownerId);
      if (error) return error;
      await tx.insert(skkCertificatesTable).values({ ...input.data, id: randomUUID(), personnelId: person.id });
      const [updated] = await tx.update(personnelTable).set({ updatedAt: new Date() }).where(eq(personnelTable.id, person.id)).returning();
      return { status: 201, person: await serialize(tx, updated) };
    });
    reply(res, result);
  });
  router.patch("/personnel/:personnelId/certificates/:certificateId", async (req, res): Promise<void> => {
    const params = UpdateSkkCertificateParams.safeParse(req.params);
    const input = UpdateSkkCertificateBody.safeParse(req.body);
    if (!params.success) { reply(res, fail(404, "Sertifikat tidak ditemukan.")); return; }
    if (!input.success || ![input.data.certificateNumber, input.data.issuer, input.data.jobTitle].every(v => v === undefined || cleanRequired(v))) {
      reply(res, fail(400, "Isian sertifikat tidak valid.")); return;
    }
    const { expectedRevision, ...changes } = input.data;
    const result = await db.transaction(async tx => {
      const ownerId = getAuth(req).userId!;
      const person = await owned(tx, params.data.personnelId, ownerId);
      if (!person) return fail(404, "Sertifikat tidak ditemukan.");
      const [cert] = await tx.select().from(skkCertificatesTable)
        .where(and(eq(skkCertificatesTable.id, params.data.certificateId), eq(skkCertificatesTable.personnelId, person.id))).for("update");
      if (!cert) return fail(404, "Sertifikat tidak ditemukan.");
      if (cert.revision !== expectedRevision) return fail(409, "Data sertifikat berubah. Muat ulang sebelum menyunting kembali.");
      const merged = { ...cert, ...changes };
      if (!validDates(merged)) return fail(400, "Tanggal tidak valid atau tanggal berakhir mendahului tanggal terbit.");
      const error = await checkDocument(tx, merged.documentId, person.caseId, ownerId);
      if (error) return error;
      await tx.update(skkCertificatesTable).set({ ...changes, revision: cert.revision + 1, updatedAt: new Date() })
        .where(eq(skkCertificatesTable.id, cert.id));
      const [updated] = await tx.update(personnelTable).set({ updatedAt: new Date() }).where(eq(personnelTable.id, person.id)).returning();
      return { status: 200, person: await serialize(tx, updated) };
    });
    reply(res, result);
  });
  router.delete("/personnel/:personnelId/certificates/:certificateId", async (req, res): Promise<void> => {
    const params = UpdateSkkCertificateParams.safeParse(req.params);
    if (!params.success) { reply(res, fail(404, "Sertifikat tidak ditemukan.")); return; }
    const result = await db.transaction(async tx => {
      const person = await owned(tx, params.data.personnelId, getAuth(req).userId!);
      if (!person) return fail(404, "Sertifikat tidak ditemukan.");
      const rows = await tx.delete(skkCertificatesTable)
        .where(and(eq(skkCertificatesTable.id, params.data.certificateId), eq(skkCertificatesTable.personnelId, person.id))).returning({ id: skkCertificatesTable.id });
      if (!rows.length) return fail(404, "Sertifikat tidak ditemukan.");
      await tx.update(personnelTable).set({ updatedAt: new Date() }).where(eq(personnelTable.id, person.id));
      return { status: 204 };
    });
    reply(res, result);
  });
  return router;
}
export default createPersonnelRouter();
