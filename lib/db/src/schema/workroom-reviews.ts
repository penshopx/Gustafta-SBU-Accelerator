import { pgTable, uuid, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { casesTable, profilesTable } from "./sbu";

export const workroomReviewsTable = pgTable("sbu_workroom_reviews", {
  id: uuid("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => casesTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => profilesTable.userId),
  sequenceNo: integer("sequence_no").notNull(),
  decision: text("decision").notNull(),
  note: text("note").notNull(),
  selection: jsonb("selection").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("sbu_workroom_reviews_case_owner_idx").on(t.caseId, t.ownerId)]);
export const insertWorkroomReviewSchema = createInsertSchema(workroomReviewsTable);
export type WorkroomReviewRow = typeof workroomReviewsTable.$inferSelect;
