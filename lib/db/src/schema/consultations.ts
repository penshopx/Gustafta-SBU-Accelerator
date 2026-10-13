import { pgTable, text, uuid, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable, casesTable } from "./sbu";

export type ConsultationMessage = {
  id: string; role: "user" | "assistant"; content: string; createdAt: string; requestId?: string;
};
export const consultationsTable = pgTable("sbu_consultations", {
  id: uuid("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  title: text("title").notNull(),
  mode: text("mode").notNull(),
  specialist: text("specialist").notNull(),
  caseId: integer("case_id").references(() => casesTable.id, { onDelete: "set null" }),
  context: text("context").notNull().default(""),
  revision: integer("revision").notNull().default(0),
  messages: jsonb("messages").$type<ConsultationMessage[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("sbu_consultations_owner_updated_idx").on(table.ownerId, table.updatedAt)]);
export const insertConsultationSchema = createInsertSchema(consultationsTable).omit({ createdAt: true, updatedAt: true });
