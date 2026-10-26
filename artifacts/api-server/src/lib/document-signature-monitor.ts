const HOUR_MS = 60 * 60_000;
export const SIGNATURE_MAX_AGE_MS = 7 * 24 * HOUR_MS;
export const SIGNATURE_WARNING_AGE_MS = 5 * 24 * HOUR_MS;
export const SIGNATURE_ALERT_COOLDOWN_MS = 24 * HOUR_MS;
export const SIGNATURE_ALERT_ACTION = "Check outbound DNS/HTTPS to database.clamav.net, CDN cooldown, disk space, database permissions and the freshclam executable. Retry the updater after fixing the cause; verify a fresh official daily database. Never bypass scanning; missing or expired signatures block downloads.";
export const SIGNATURE_RECOVERY_ACTION = "Signature updates recovered and the official daily database is below the warning age. Continue monitoring; document scans still enforce their own checks.";

export type SignatureHealth =
  | { state: "available"; builtAt: number }
  | { state: "missing" | "unreadable" };
type Reason = "update_failed" | "expiring" | "missing" | "unreadable" | "expired";
export type SignatureNotice = {
  event: "scan_signature_alert" | "scan_signature_recovered";
  severity: "warning" | "critical" | "info";
  reason: Reason | "healthy";
  signatureAgeHours: number | null;
  hoursUntilExpiry: number | null;
  consecutiveFailures: number;
  action: string;
};

// Operational state only. No request, document, user or raw error data.
export type SignatureIncidentState = {
  failures: number;
  incident: boolean;
  lastAlert: number | null;
  lastRecovery: number | null;
  lastSeverity: SignatureNotice["severity"];
};
export const initialSignatureIncidentState = (): SignatureIncidentState => ({
  failures: 0, incident: false, lastAlert: null, lastRecovery: null, lastSeverity: "info",
});

// Mutates only the supplied state, so the same rules run under a shared row lock.
export function evaluateSignatureHealth(
  state: SignatureIncidentState, success: boolean, health: SignatureHealth, time: number,
): SignatureNotice | undefined {
    state.failures = success ? 0 : Math.min(Number.MAX_SAFE_INTEGER, state.failures + 1);
    const age = health.state === "available" ? Math.max(0, time - health.builtAt) : null;
    const reason: Reason | null = health.state !== "available" ? health.state
      : age! >= SIGNATURE_MAX_AGE_MS ? "expired"
      : age! >= SIGNATURE_WARNING_AGE_MS ? "expiring"
      : !success ? "update_failed" : null;
    const metrics = {
      signatureAgeHours: age === null ? null : Math.floor(age / HOUR_MS),
      hoursUntilExpiry: age === null ? null : Math.max(0, Math.floor((SIGNATURE_MAX_AGE_MS - age) / HOUR_MS)),
      consecutiveFailures: state.failures,
    };
    if (reason) {
      const severity = reason === "update_failed" || reason === "expiring" ? "warning" : "critical";
      const escalated = state.lastSeverity === "warning" && severity === "critical";
      state.incident = true;
      if (!escalated && state.lastAlert !== null && time - state.lastAlert < SIGNATURE_ALERT_COOLDOWN_MS) return;
      state.lastAlert = time;
      state.lastSeverity = severity;
      return {
        event: "scan_signature_alert", severity, reason, ...metrics,
        action: SIGNATURE_ALERT_ACTION,
      };
    } else if (state.incident) {
      state.incident = false;
      if (state.lastRecovery !== null && time - state.lastRecovery < SIGNATURE_ALERT_COOLDOWN_MS) return;
      state.lastRecovery = time;
      return {
        event: "scan_signature_recovered", severity: "info", reason: "healthy", ...metrics,
        action: SIGNATURE_RECOVERY_ACTION,
      };
    }
    return undefined;
}

// Synchronous local adapter for offline tests. Runtime uses the shared adapter.
export function createSignatureMonitor(
  notify: (notice: SignatureNotice) => void,
  now: () => number = Date.now,
) {
  const state = initialSignatureIncidentState();
  return (success: boolean, health: SignatureHealth) => {
    const notice = evaluateSignatureHealth(state, success, health, now());
    if (notice) notify(notice);
  };
}
