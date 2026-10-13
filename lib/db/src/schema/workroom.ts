import { pgTable, uuid, integer, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { casesTable, profilesTable } from "./sbu";

export const workroomItemsTable = pgTable("sbu_workroom_items", {
  id: uuid("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => casesTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("todo"),
  assignee: text("assignee").notNull().default(""),
  dueOn: date("due_on", { mode: "string" }),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("sbu_workroom_case_owner_idx").on(t.caseId, t.ownerId)]);
export const insertWorkroomItemSchema = createInsertSchema(workroomItemsTable).omit({ createdAt: true, updatedAt: true });
export type WorkroomItemRow = typeof workroomItemsTable.$inferSelect;
