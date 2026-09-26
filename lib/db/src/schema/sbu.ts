import { pgTable, text, serial, integer, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("sbu_profiles", {
  userId: text("user_id").primaryKey(),
  role: text("role").notNull().default("belum_dipilih"),
  displayName: text("display_name").notNull().default(""),
  organizationName: text("organization_name").notNull().default(""),
});

export const casesTable = pgTable("sbu_cases", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  companyName: text("company_name").notNull(),
  requestType: text("request_type").notNull(),
  qualification: text("qualification").notNull(),
  classification: text("classification").notNull(),
  status: text("status").notNull().default("draf"),
  existingSbuExpiresOn: date("existing_sbu_expires_on", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const evidenceTable = pgTable("sbu_evidence", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => casesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("sbu_evidence_case_code_unique").on(table.caseId, table.code)]);

export const insertProfileSchema = createInsertSchema(profilesTable);
export type ProfileRow = typeof profilesTable.$inferSelect;
export const insertCaseSchema = createInsertSchema(casesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type SbuCaseRow = typeof casesTable.$inferSelect;
export const insertEvidenceSchema = createInsertSchema(evidenceTable).omit({ id: true, updatedAt: true });
export type EvidenceRow = typeof evidenceTable.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;