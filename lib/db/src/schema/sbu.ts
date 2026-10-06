import { pgTable, text, serial, integer, timestamp, date, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./workspace";

export const profilesTable = pgTable("sbu_profiles", {
  userId: text("user_id").primaryKey(),
  role: text("role").notNull().default("belum_dipilih"),
  displayName: text("display_name").notNull().default(""),
  organizationName: text("organization_name").notNull().default(""),
});

export const casesTable = pgTable("sbu_cases", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  clientId: integer("client_id").references(() => clientsTable.id),
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

// Catatan penerbit resmi bersifat global, tidak dimiliki atau ditulis oleh pemohon.
export const transitionVerificationsTable = pgTable("sbu_transition_verifications", {
  track: text("track").primaryKey(),
  publisher: text("publisher").notNull(),
  sourceUrl: text("source_url").notNull(),
  documentNumber: text("document_number").notNull(),
  signatory: text("signatory").notNull(),
  issuedOn: date("issued_on", { mode: "string" }).notNull(),
  scope: text("scope").notNull(),
  documentStatus: text("document_status").notNull(),
  sourceVerified: boolean("source_verified").notNull(),
  expertName: text("expert_name").notNull(),
  expertOrganization: text("expert_organization").notNull(),
  expertReview: text("expert_review").notNull(),
  expertReviewedOn: date("expert_reviewed_on", { mode: "string" }).notNull(),
  expertApproved: boolean("expert_approved").notNull(),
  verifiedBy: text("verified_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type TransitionVerificationRow = typeof transitionVerificationsTable.$inferSelect;

export const insertProfileSchema = createInsertSchema(profilesTable);
export type ProfileRow = typeof profilesTable.$inferSelect;
export const insertCaseSchema = createInsertSchema(casesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type SbuCaseRow = typeof casesTable.$inferSelect;
export const insertEvidenceSchema = createInsertSchema(evidenceTable).omit({ id: true, updatedAt: true });
export type EvidenceRow = typeof evidenceTable.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;