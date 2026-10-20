const HOUR_MS = 60 * 60_000;
export const SIGNATURE_MAX_AGE_MS = 7 * 24 * HOUR_MS;
export const SIGNATURE_WARNING_AGE_MS = 5 * 24 * HOUR_MS;
export const SIGNATURE_ALERT_COOLDOWN_MS = 24 * HOUR_MS;

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

// Process-local incident state. No request, document, user or raw error data
// enters the operational notification payload.
export function createSignatureMonitor(
  notify: (notice: SignatureNotice) => void,
  now: () => number = Date.now,
) {
  let failures = 0;
  let incident = false;
  let lastAlert = -Infinity;
  let lastRecovery = -Infinity;
  let lastSeverity: SignatureNotice["severity"] = "info";
  return (success: boolean, health: SignatureHealth) => {
    const time = now();
    failures = success ? 0 : failures + 1;
    const age = health.state === "available" ? Math.max(0, time - health.builtAt) : null;
    const reason: Reason | null = health.state !== "available" ? health.state
      : age! >= SIGNATURE_MAX_AGE_MS ? "expired"
      : age! >= SIGNATURE_WARNING_AGE_MS ? "expiring"
      : !success ? "update_failed" : null;
    const metrics = {
      signatureAgeHours: age === null ? null : Math.floor(age / HOUR_MS),
      hoursUntilExpiry: age === null ? null : Math.max(0, Math.floor((SIGNATURE_MAX_AGE_MS - age) / HOUR_MS)),
      consecutiveFailures: failures,
    };
    if (reason) {
      const severity = reason === "update_failed" || reason === "expiring" ? "warning" : "critical";
      const escalated = lastSeverity === "warning" && severity === "critical";
      incident = true;
      if (!escalated && time - lastAlert < SIGNATURE_ALERT_COOLDOWN_MS) return;
      lastAlert = time;
      lastSeverity = severity;
      notify({
        event: "scan_signature_alert", severity, reason, ...metrics,
        action: "Check outbound DNS/HTTPS to database.clamav.net, CDN cooldown, disk space, database permissions and the freshclam executable. Retry the updater after fixing the cause; verify a fresh official daily database. Never bypass scanning; missing or expired signatures block downloads.",
      });
    } else if (incident) {
      incident = false;
      if (time - lastRecovery < SIGNATURE_ALERT_COOLDOWN_MS) return;
      lastRecovery = time;
      notify({
        event: "scan_signature_recovered", severity: "info", reason: "healthy", ...metrics,
        action: "Signature updates recovered and the official daily database is below the warning age. Continue monitoring; document scans still enforce their own checks.",
      });
    }
  };
}
