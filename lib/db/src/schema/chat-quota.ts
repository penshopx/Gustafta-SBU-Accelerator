import { pgTable, text, integer, timestamp, uuid, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Aggregate counters only: never add prompts, replies or provider error payloads.
export const sbuChatQuotaTable = pgTable("sbu_chat_quota", {
  userId: text("user_id").primaryKey(),
  dayStart: timestamp("day_start", { withTimezone: true }).notNull(),
  dayCount: integer("day_count").notNull().default(0),
  minuteStart: timestamp("minute_start", { withTimezone: true }).notNull(),
  minuteCount: integer("minute_count").notNull().default(0),
  leaseId: uuid("lease_id"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
}, (table) => [
  check("chat_day_count_nonnegative", sql`${table.dayCount} >= 0`),
  check("chat_minute_count_nonnegative", sql`${table.minuteCount} >= 0`),
  check("chat_lease_pair", sql`(${table.leaseId} IS NULL) = (${table.leaseUntil} IS NULL)`),
]);
export const insertSbuChatQuotaSchema = createInsertSchema(sbuChatQuotaTable);
export type SbuChatQuotaRow = typeof sbuChatQuotaTable.$inferSelect;
