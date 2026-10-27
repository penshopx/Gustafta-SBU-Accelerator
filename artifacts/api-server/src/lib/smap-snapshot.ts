import { and, asc, desc, eq } from "drizzle-orm";
import { db, documentsTable, smapChecklistRevisionsTable as revisions } from "@workspace/db";
import { GetSmapChecklistResponse, SaveSmapChecklistEntryResponse as Entry } from "@workspace/api-zod";
import { SMAP_TEMPLATE, SMAP_DISCLAIMER, smapQuestions } from "./smap-checklist";
import { smapDocuments } from "./smap-documents";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Caller must first authorize the case. Use the caller's transaction so the
// declaration, review and document availability share its repeatable-read view.
export async function caseSmapSnapshot(tx: Tx, caseId: number, ownerId: string) {
  const docs = smapDocuments(await tx.select().from(documentsTable)
    .where(and(eq(documentsTable.caseId, caseId), eq(documentsTable.ownerId, ownerId))));
  const rows = await tx.selectDistinctOn([revisions.questionId]).from(revisions)
    .where(and(eq(revisions.caseId, caseId), eq(revisions.ownerId, ownerId),
      eq(revisions.templateVersion, SMAP_TEMPLATE)))
    .orderBy(asc(revisions.questionId), desc(revisions.revision));
  return GetSmapChecklistResponse.parse({
    caseId, templateVersion: SMAP_TEMPLATE, disclaimer: SMAP_DISCLAIMER,
    questions: smapQuestions, documents: docs,
    entries: rows.map(row => {
      const entry = Entry.parse(row.record);
      return { ...entry, needsReview: entry.evidence.some(e =>
        !docs.some(d => d.id === e.id && d.fingerprint === e.fingerprint)) };
    }),
  });
}
