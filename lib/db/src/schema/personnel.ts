import { pgTable, text, uuid, integer, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable, casesTable } from "./sbu";
import { documentsTable } from "./standalone";

export const personnelTable = pgTable("sbu_personnel", {
  id: uuid("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  fullName: text("full_name").notNull(),
  assignment: text("assignment").notNull().default("lainnya"),
  position: text("position").notNull().default(""),
  caseId: integer("case_id").references(() => casesTable.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("sbu_personnel_owner_updated_idx").on(t.ownerId, t.updatedAt)]);
export const insertPersonnelSchema = createInsertSchema(personnelTable).omit({ createdAt: true, updatedAt: true });
export type PersonnelRow = typeof personnelTable.$inferSelect;

export const skkCertificatesTable = pgTable("sbu_skk_certificates", {
  id: uuid("id").primaryKey(),
  personnelId: uuid("personnel_id").notNull().references(() => personnelTable.id, { onDelete: "cascade" }),
  certificateNumber: text("certificate_number").notNull(),
  issuer: text("issuer").notNull(),
  jobTitle: text("job_title").notNull(),
  level: integer("level"),
  issuedOn: date("issued_on", { mode: "string" }),
  expiresOn: date("expires_on", { mode: "string" }),
  documentId: uuid("document_id").references(() => documentsTable.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("sbu_skk_personnel_idx").on(t.personnelId)]);
export const insertSkkCertificateSchema = createInsertSchema(skkCertificatesTable).omit({ createdAt: true, updatedAt: true });
export type SkkCertificateRow = typeof skkCertificatesTable.$inferSelect;
