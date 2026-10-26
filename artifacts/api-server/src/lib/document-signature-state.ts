import {
  evaluateSignatureHealth,
  type SignatureHealth, type SignatureIncidentState, type SignatureNotice,
} from "./document-signature-monitor";

type ConnectionSource = Pick<typeof import("@workspace/db")["pool"], "connect">;
type StateReport = (event: "scan_signature_state_failed" | "scan_signature_state_recovered") => void;

// One fixed operational key per application's database; never keyed by a user,
// document, host, process, channel or credential. Both transports use this gate.
const INCIDENT_KEY = "antivirus-signatures";
export function createPostgresSignatureStateStore(
  source: ConnectionSource,
  now?: () => number,
) {
  return async (success: boolean, health: SignatureHealth): Promise<SignatureNotice | undefined> => {
    const client = await source.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query(`INSERT INTO antivirus_signature_incidents (incident_key)
        VALUES ($1) ON CONFLICT (incident_key) DO NOTHING`, [INCIDENT_KEY]);
      const { rows: [row] } = await client.query(`SELECT failures, incident,
        last_alert_ms AS "lastAlert", last_recovery_ms AS "lastRecovery",
        last_severity AS "lastSeverity"
        FROM antivirus_signature_incidents WHERE incident_key = $1 FOR UPDATE`, [INCIDENT_KEY]);
      const state: SignatureIncidentState = {
        failures: Number(row.failures), incident: row.incident,
        lastAlert: row.lastAlert === null ? null : Number(row.lastAlert),
        lastRecovery: row.lastRecovery === null ? null : Number(row.lastRecovery),
        lastSeverity: row.lastSeverity,
      };
      // Database time avoids skew between instances. Read after acquiring lock.
      const time = now ? now() : Number((await client.query(
        "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms",
      )).rows[0].ms);
      const notice = evaluateSignatureHealth(state, success, health, time);
      await client.query(`UPDATE antivirus_signature_incidents SET failures = $2,
        incident = $3, last_alert_ms = $4, last_recovery_ms = $5, last_severity = $6
        WHERE incident_key = $1`, [INCIDENT_KEY, state.failures, state.incident,
        state.lastAlert, state.lastRecovery, state.lastSeverity]);
      await client.query("COMMIT");
      return notice;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  };
}

export function createSharedSignatureMonitor(
  notify: (notice: SignatureNotice) => void,
  report: StateReport,
  observe = createPostgresSignatureStateStore({
    // Lazy import keeps offline fixtures and custom observers database-free.
    connect: async () => (await import("@workspace/db")).pool.connect(),
  }),
) {
  let failed = false;
  return async (success: boolean, health: SignatureHealth) => {
    let notice: SignatureNotice | undefined;
    try {
      notice = await observe(success, health);
    } catch {
      // No local fallback: it would reintroduce cross-instance alert flooding.
      // Never log SQL, exceptions, connection strings or raw updater output.
      if (!failed) report("scan_signature_state_failed");
      failed = true;
      return;
    }
    if (failed) report("scan_signature_state_recovered");
    failed = false;
    if (notice) notify(notice);
  };
}
