import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, casesTable, evidenceTable, documentsTable, workroomItemsTable } from "@workspace/db";
import { PreviewWorkroomReviewResponse, type ReviewSnapshot, type ReviewSelection } from "@workspace/api-zod";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function normalizeSelection(input: ReviewSelection): ReviewSelection | null {
  const result = {
    workroomIds: [...new Set(input.workroomIds)].sort(),
    evidenceIds: [...new Set(input.evidenceIds)].sort((a, b) => a - b),
    documentIds: [...new Set(input.documentIds)].sort(),
  };
  if (Object.values(result).every(ids => ids.length === 0) ||
      Object.keys(result).some(key => result[key as keyof ReviewSelection].length !== input[key as keyof ReviewSelection].length)) return null;
  return result;
}

// Parent lock precedes child locks, matching Workroom writes. Nothing is mutated.
// Read-only previews use one repeatable-read snapshot; recording locks selected rows
// until the decision and its historical snapshot have committed together.
export async function loadReviewMaterials(tx: Tx, caseId: number, ownerId: string, selection?: ReviewSelection, lock = false) {
  const parentQuery = tx.select().from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.ownerId, ownerId)));
  const [parent] = await (lock ? parentQuery.for("update") : parentQuery);
  if (!parent) return null;
  const workroomQuery = tx.select().from(workroomItemsTable)
    .where(and(eq(workroomItemsTable.caseId, caseId), eq(workroomItemsTable.ownerId, ownerId),
      selection ? inArray(workroomItemsTable.id, selection.workroomIds) : undefined))
    .orderBy(asc(workroomItemsTable.id));
  const workroom = await (lock ? workroomQuery.for("share") : workroomQuery);
  const evidenceQuery = tx.select().from(evidenceTable)
    .where(and(eq(evidenceTable.caseId, caseId), selection ? inArray(evidenceTable.id, selection.evidenceIds) : undefined))
    .orderBy(asc(evidenceTable.id));
  const evidence = await (lock ? evidenceQuery.for("share") : evidenceQuery);
  // Do not read/return file contents, signed URLs or object paths.
  const documentsQuery = tx.select({
    id: documentsTable.id, name: documentsTable.name, category: documentsTable.category,
    description: documentsTable.description, version: documentsTable.version,
    contentType: documentsTable.contentType, size: documentsTable.size,
    status: documentsTable.status, scanStatus: documentsTable.scanStatus, createdAt: documentsTable.createdAt,
  }).from(documentsTable)
    .where(and(eq(documentsTable.caseId, caseId), eq(documentsTable.ownerId, ownerId),
      eq(documentsTable.status, "ready"), eq(documentsTable.scanStatus, "clean"),
      selection ? inArray(documentsTable.id, selection.documentIds) : undefined))
    .orderBy(asc(documentsTable.id));
  const documents = await (lock ? documentsQuery.for("share") : documentsQuery);
  const snapshot = PreviewWorkroomReviewResponse.shape.snapshot.parse({
    schemaVersion: "review-v1",
    case: { ...parent, updatedAt: parent.updatedAt.toISOString() },
    workroomItems: workroom.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
    evidence: evidence.map(item => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
    documents: documents.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })),
  });
  return selection && !pickReviewMaterials(snapshot, selection) ? null : snapshot;
}
export function pickReviewMaterials(all: ReviewSnapshot, selection: ReviewSelection): ReviewSnapshot | null {
  const selected = {
    ...all,
    workroomItems: all.workroomItems.filter(item => selection.workroomIds.includes(item.id)),
    evidence: all.evidence.filter(item => selection.evidenceIds.includes(item.id)),
    documents: all.documents.filter(item => selection.documentIds.includes(item.id)),
  };
  return selected.workroomItems.length === selection.workroomIds.length &&
    selected.evidence.length === selection.evidenceIds.length &&
    selected.documents.length === selection.documentIds.length ? selected : null;
}
export function reviewHash(snapshot: ReviewSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
