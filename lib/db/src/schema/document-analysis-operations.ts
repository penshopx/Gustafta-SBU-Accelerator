import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Separate from chat quota and operational AI budgets.
export const documentAnalysisOperationsTable = pgTable("sbu_document_analysis_operations", {
  ownerId: text("owner_id").primaryKey(),
  analysisSince: timestamp("analysis_since", { withTimezone: true }).notNull().defaultNow(),
  analysisCount: integer("analysis_count").notNull().default(0),
  inspectionSince: timestamp("inspection_since", { withTimezone: true }).notNull().defaultNow(),
  inspectionCount: integer("inspection_count").notNull().default(0),
  token: uuid("token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
export const insertDocumentAnalysisOperationSchema = createInsertSchema(documentAnalysisOperationsTable);
export type DocumentAnalysisOperation = typeof documentAnalysisOperationsTable.$inferSelect;
