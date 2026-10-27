import { pgTable, uuid, integer, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { casesTable, profilesTable } from "./sbu";

// Append-only declaration/review history; document bytes are never copied.
export const smapChecklistRevisionsTable = pgTable("sbu_smap_checklist_revisions", {
  id: uuid("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => casesTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  templateVersion: text("template_version").notNull(),
  questionId: text("question_id").notNull(),
  revision: integer("revision").notNull(),
  record: jsonb("record").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("sbu_smap_revision_unique").on(t.caseId, t.templateVersion, t.questionId, t.revision)]);
