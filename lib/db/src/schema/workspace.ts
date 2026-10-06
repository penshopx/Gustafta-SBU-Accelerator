import { boolean, check, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Private workspaces only. An applicant's selected profile role is NOT a
// membership grant, and these tables do not enable team sharing.
export const workspacesTable = pgTable("sbu_workspaces", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("sbu_workspaces_owner_unique").on(table.ownerId)]);

export const clientsTable = pgTable("sbu_clients", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => workspacesTable.id),
  name: text("name").notNull(),
  businessType: text("business_type", { enum: ["kontraktor", "konsultan"] }),
  npwpMasked: text("npwp_masked"),
  nib: text("nib"),
  address: text("address"),
  isDefault: boolean("is_default").notNull().default(false),
  // The legacy default is a container, not a verified company profile.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sbu_clients_default_unique").on(table.orgId).where(sql`${table.isDefault} = true`),
  check("sbu_clients_business_type", sql`${table.businessType} IS NULL OR ${table.businessType} IN ('kontraktor', 'konsultan')`),
]);

export const auditLogsTable = pgTable("sbu_audit_logs", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => workspacesTable.id),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  summary: jsonb("summary").$type<{ changedFields?: string[] }>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettingsTable = pgTable("sbu_app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true });
export type ClientRow = typeof clientsTable.$inferSelect;
