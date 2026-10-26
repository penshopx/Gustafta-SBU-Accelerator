// Deliberately excluded from the offline test suite: this sends two real,
// clearly labelled synthetic messages to the operator-approved destination.
import { setTimeout } from "node:timers/promises";
import { createSlackSignatureTransport } from "../src/lib/document-signature-slack";
import { logger } from "../src/lib/logger";

const channel = process.env.DOCUMENT_SIGNATURE_SLACK_CHANNEL ?? "";
const connectionId = process.env.DOCUMENT_SIGNATURE_SLACK_CONNECTION_ID ?? "";
if (process.env.DOCUMENT_SIGNATURE_ALERT_PROVIDER !== "slack" ||
    !/^[CG][A-Z0-9]+$/.test(channel) || !/^conn_[A-Za-z0-9_-]+$/.test(connectionId)) {
  logger.error({ event: "scan_signature_probe_invalid_config" }, "Slack probe not sent");
  process.exitCode = 1;
} else {
  const transport = createSlackSignatureTransport({ channel, connectionId, testNotice: true });
  try {
    await transport({
      event: "scan_signature_alert", severity: "warning", reason: "update_failed",
      signatureAgeHours: 24, hoursUntilExpiry: 144, consecutiveFailures: 1, action: "",
    }, AbortSignal.timeout(5_000));
    // Respect Slack's approximate one-message-per-second per-channel limit.
    await setTimeout(1_100);
    await transport({
      event: "scan_signature_recovered", severity: "info", reason: "healthy",
      signatureAgeHours: 1, hoursUntilExpiry: 167, consecutiveFailures: 0, action: "",
    }, AbortSignal.timeout(5_000));
    logger.info({ event: "scan_signature_probe_acknowledged", messages: 2 },
      "Slack acknowledged both synthetic notices in the selected channel");
  } catch {
    logger.error({ event: "scan_signature_probe_failed" },
      "Slack did not acknowledge both synthetic notices; check integration and channel access");
    process.exitCode = 1;
  }
}
