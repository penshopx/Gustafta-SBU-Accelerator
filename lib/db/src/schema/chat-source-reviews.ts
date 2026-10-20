import { pgTable, text, integer, timestamp, jsonb, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// UPDATE/DELETE/TRUNCATE are also blocked by the workspace SQL migration.
export const sbuChatSourceDecisionsTable = pgTable("sbu_chat_source_decisions", {
  sourceKey: text("source_key").notNull(),
  revision: integer("revision").notNull(),
  versionId: text("version_id").notNull(),
  expectedRevision: integer("expected_revision").notNull(),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  reviewReference: text("review_reference").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  citations: jsonb("citations").notNull(),
}, table => [
  primaryKey({ columns: [table.sourceKey, table.revision] }),
  check("sbu_chat_source_decisions_revision_check", sql`${table.revision} > 0`),
  check("sbu_chat_source_decisions_expected_revision_check", sql`${table.expectedRevision} = ${table.revision} - 1`),
  check("sbu_chat_source_decisions_status_check", sql`${table.status} IN ('approved', 'withdrawn', 'not_approved')`),
  check("sbu_chat_source_decisions_reason_check", sql`length(trim(${table.reason})) > 0`),
  check("sbu_chat_source_decisions_review_reference_check", sql`length(trim(${table.reviewReference})) > 0`),
  check("sbu_chat_source_decisions_citations_check", sql`jsonb_typeof(${table.citations}) = 'array'`),
]);
export const insertSbuChatSourceDecisionSchema = createInsertSchema(sbuChatSourceDecisionsTable);
export type SbuChatSourceDecisionRow = typeof sbuChatSourceDecisionsTable.$inferSelect;
