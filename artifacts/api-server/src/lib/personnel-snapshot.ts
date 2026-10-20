import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { db, documentsTable, personnelTable, skkCertificatesTable, type PersonnelRow } from "@workspace/db";
import { GetPersonnelResponse } from "@workspace/api-zod";
import { declaredDateStatus, jakartaToday } from "./skk-calendar";

type Source = Pick<typeof db, "select">;

// The caller owns the read transaction so all case/person/certificate reads share
// a snapshot. Do not open a separate transaction here.
export async function serializePersonnel(source: Source, person: PersonnelRow, today = jakartaToday()) {
  const certificates = await source.select({
    ...getTableColumns(skkCertificatesTable), documentName: documentsTable.name,
    documentCaseId: documentsTable.caseId, documentStatus: documentsTable.status, documentScanStatus: documentsTable.scanStatus,
  }).from(skkCertificatesTable).leftJoin(documentsTable,
    and(eq(documentsTable.id, skkCertificatesTable.documentId), eq(documentsTable.ownerId, person.ownerId),
      ...(person.caseId === null ? [] : [eq(documentsTable.caseId, person.caseId)])))
    .where(eq(skkCertificatesTable.personnelId, person.id))
    .orderBy(desc(skkCertificatesTable.updatedAt), desc(skkCertificatesTable.id));
  return GetPersonnelResponse.parse({
    ...person, createdAt: person.createdAt.toISOString(), updatedAt: person.updatedAt.toISOString(), asOfDate: today,
    certificates: certificates.map(c => ({
      ...c, documentId: c.documentCaseId === null ? null : c.documentId,
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
      documentAvailable: c.documentStatus === "ready" && c.documentScanStatus === "clean",
      ...declaredDateStatus(c.issuedOn, c.expiresOn, today),
    })),
  });
}

export async function casePersonnelSnapshot(source: Source, caseId: number, ownerId: string, asOf: Date) {
  const people = await source.select().from(personnelTable)
    .where(and(eq(personnelTable.caseId, caseId), eq(personnelTable.ownerId, ownerId)))
    .orderBy(desc(personnelTable.updatedAt), desc(personnelTable.id));
  const today = jakartaToday(asOf);
  return Promise.all(people.map(person => serializePersonnel(source, person, today)));
}
