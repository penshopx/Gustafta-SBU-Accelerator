import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  createSignatureDelivery, sanitizeSignatureNotice,
  type SignatureDeliveryReport, type SignatureTransport,
} from "./document-signature-delivery";

export function createSlackSignatureTransport({
  channel, connectionId, testNotice = false,
  proxyFactory = () => new ReplitConnectors().createProxyFetch("slack", { connectionId }),
}: {
  channel: string;
  connectionId: string;
  testNotice?: boolean;
  proxyFactory?: () => typeof fetch;
}): SignatureTransport {
  let proxy: typeof fetch | undefined;
  return async (input, signal) => {
    const notice = sanitizeSignatureNotice(input);
    if (signal.aborted) throw new Error("Delivery cancelled");
    // Lazy initialization keeps missing identity/connector failures inside the
    // delivery retry boundary, never in scanner/updater startup.
    proxy ??= proxyFactory();
    const recovered = notice.event === "scan_signature_recovered";
    const text = [
      testNotice ? "[UJI SAMBUNGAN — BUKAN INSIDEN NYATA]" : "[Gustafta — Antivirus]",
      recovered ? "Pemulihan signature antivirus" : "Peringatan signature antivirus",
      `event=${notice.event}`,
      `severity=${notice.severity}; reason=${notice.reason}`,
      `signatureAgeHours=${notice.signatureAgeHours ?? "unknown"}`,
      `hoursUntilExpiry=${notice.hoursUntilExpiry ?? "unknown"}`,
      `consecutiveFailures=${notice.consecutiveFailures}`,
      notice.action,
      ...(testNotice ? ["Pesan sintetis untuk memeriksa kanal. Tidak ada signature atau hasil pemindaian yang diubah."] : []),
    ].join("\n");
    const response = await proxy("/chat.postMessage", {
      method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel, text, mrkdwn: false, parse: "none",
        unfurl_links: false, unfurl_media: false,
      }),
    });
    // HTTP 200 is NOT sufficient: Slack returns logical failures in JSON.
    // Do not propagate response bodies, error codes, or SDK exception details.
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      throw new Error("Slack delivery failed");
    }
    const data: unknown = await response.json();
    if (typeof data !== "object" || !data || !("ok" in data) || data.ok !== true ||
        !("channel" in data) || data.channel !== channel ||
        !("ts" in data) || typeof data.ts !== "string") {
      throw new Error("Slack delivery not acknowledged");
    }
  };
}

// Explicit provider selection prevents a broken Slack configuration from
// silently falling back to a different destination.
export function createConfiguredSignatureDelivery(
  report: SignatureDeliveryReport,
  env: Partial<Pick<NodeJS.ProcessEnv,
    "DOCUMENT_SIGNATURE_ALERT_PROVIDER" | "DOCUMENT_SIGNATURE_SLACK_CHANNEL" |
    "DOCUMENT_SIGNATURE_SLACK_CONNECTION_ID" | "DOCUMENT_SIGNATURE_ALERT_URL" |
    "DOCUMENT_SIGNATURE_ALERT_TOKEN">> = process.env,
) {
  const provider = env.DOCUMENT_SIGNATURE_ALERT_PROVIDER ?? "https";
  if (provider === "slack") {
    const channel = env.DOCUMENT_SIGNATURE_SLACK_CHANNEL ?? "";
    const connectionId = env.DOCUMENT_SIGNATURE_SLACK_CONNECTION_ID ?? "";
    if (/^[CG][A-Z0-9]+$/.test(channel) && /^conn_[A-Za-z0-9_-]+$/.test(connectionId)) {
      return createSignatureDelivery({
        report, transport: createSlackSignatureTransport({ channel, connectionId }),
      });
    }
  } else if (provider === "https") {
    return createSignatureDelivery({
      report, url: env.DOCUMENT_SIGNATURE_ALERT_URL,
      token: env.DOCUMENT_SIGNATURE_ALERT_TOKEN,
    });
  }
  // Invalid configuration is reported without echoing environment values.
  return createSignatureDelivery({ report, url: "invalid" });
}
