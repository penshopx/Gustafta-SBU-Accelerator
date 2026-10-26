import { bigint, boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const antivirusSignatureIncidentsTable = pgTable("antivirus_signature_incidents", {
  incidentKey: text("incident_key").primaryKey(),
  failures: bigint("failures", { mode: "number" }).notNull().default(0),
  incident: boolean("incident").notNull().default(false),
  lastAlertMs: bigint("last_alert_ms", { mode: "number" }),
  lastRecoveryMs: bigint("last_recovery_ms", { mode: "number" }),
  lastSeverity: text("last_severity").notNull().default("info"),
});
export const insertAntivirusSignatureIncidentSchema = createInsertSchema(antivirusSignatureIncidentsTable);
export type AntivirusSignatureIncident = typeof antivirusSignatureIncidentsTable.$inferSelect;
