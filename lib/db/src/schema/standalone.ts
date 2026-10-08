import { pgTable, text, integer, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { casesTable, profilesTable } from "./sbu";

export const companyProfilesTable = pgTable("sbu_company_profiles", {
  ownerId: text("owner_id").primaryKey().references(() => profilesTable.userId),
  companyName: text("company_name").notNull().default(""),
  nib: text("nib").notNull().default(""),
  npwp: text("npwp").notNull().default(""),
  address: text("address").notNull().default(""),
  responsiblePerson: text("responsible_person").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const documentsTable = pgTable("sbu_documents", {
  id: uuid("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => casesTable.id, { onDelete: "restrict" }),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  objectPath: text("object_path").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sbu_documents_owner_case_idx").on(t.ownerId, t.caseId)]);
export const insertCompanyProfileSchema = createInsertSchema(companyProfilesTable);
export const insertDocumentSchema = createInsertSchema(documentsTable);
export type CompanyProfileRow = typeof companyProfilesTable.$inferSelect;
export type DocumentRow = typeof documentsTable.$inferSelect;
