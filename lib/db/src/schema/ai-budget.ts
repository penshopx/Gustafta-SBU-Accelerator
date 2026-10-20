import { bigint, boolean, check, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const aiBudgetLockTable = pgTable("ai_budget_lock", {
  id: integer("id").primaryKey(),
}, t => [check("ai_budget_lock_id_check", sql`${t.id} = 1`)]);
export const insertAiBudgetLockSchema = createInsertSchema(aiBudgetLockTable);
export type AiBudgetLockRow = typeof aiBudgetLockTable.$inferSelect;

export const aiBudgetCountersTable = pgTable("ai_budget_counters", {
  scope: text("scope").notNull(),
  period: text("period").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  policyFingerprint: text("policy_fingerprint").notNull(),
  reservedMicros: bigint("reserved_micros", { mode: "number" }).notNull().default(0),
  warned: boolean("warned").notNull().default(false),
  rejected: boolean("rejected").notNull().default(false),
}, t => [
  primaryKey({ columns: [t.scope, t.period, t.periodStart] }),
  check("ai_budget_counters_scope_check", sql`${t.scope} IN ('global','assistant','consultation','document_analysis')`),
  check("ai_budget_counters_period_check", sql`${t.period} IN ('day','month')`),
  check("ai_budget_counters_reserved_micros_check", sql`${t.reservedMicros} >= 0`),
]);
export const insertAiBudgetCounterSchema = createInsertSchema(aiBudgetCountersTable);
export type AiBudgetCounterRow = typeof aiBudgetCountersTable.$inferSelect;
