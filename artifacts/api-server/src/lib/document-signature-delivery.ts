import {
  SIGNATURE_ALERT_ACTION, SIGNATURE_RECOVERY_ACTION,
  type SignatureNotice,
} from "./document-signature-monitor";

type DeliveryEvent = "scan_signature_delivery_unconfigured" | "scan_signature_delivery_invalid_config"
  | "scan_signature_delivery_failed" | "scan_signature_delivery_recovered"
  | "scan_signature_delivery_exhausted" | "scan_signature_delivery_overflow";
export type SignatureDeliveryReport = (event: DeliveryEvent) => void;

// Only this allow-list crosses the collector boundary. Never forward logger
// bindings, exception messages, request context, or arbitrary notice properties.
export function sanitizeSignatureNotice(notice: SignatureNotice): SignatureNotice {
  const recovery = notice.event === "scan_signature_recovered";
  const reasons = ["update_failed", "expiring", "missing", "unreadable", "expired"];
  if ((!recovery && notice.event !== "scan_signature_alert") ||
      (recovery ? notice.reason !== "healthy" || notice.severity !== "info"
        : !reasons.includes(notice.reason) || !["warning", "critical"].includes(notice.severity))) {
    throw new Error("Invalid operational notice");
  }
  const metric = (value: number | null) => {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error("Invalid operational metric");
    }
    return value;
  };
  if (notice.consecutiveFailures === null) throw new Error("Invalid failure count");
  return {
    event: notice.event, severity: notice.severity, reason: notice.reason,
    signatureAgeHours: metric(notice.signatureAgeHours),
    hoursUntilExpiry: metric(notice.hoursUntilExpiry),
    consecutiveFailures: metric(notice.consecutiveFailures)!,
    action: recovery ? SIGNATURE_RECOVERY_ACTION : SIGNATURE_ALERT_ACTION,
  };
}

export type SignatureTransport = (notice: SignatureNotice, signal: AbortSignal) => Promise<void>;

// Bounded queue shared by the HTTPS collector and managed Slack transports.
export function createSignatureDelivery({
  url, token, transport, report, send = fetch, timeoutMs = 5_000,
  retryDelays = [5_000, 30_000],
}: {
  url?: string;
  token?: string;
  transport?: SignatureTransport;
  report: SignatureDeliveryReport;
  send?: typeof fetch;
  timeoutMs?: number;
  retryDelays?: number[];
}) {
  let endpoint: string | undefined;
  const emit = (event: DeliveryEvent) => {
    // A broken logging sink must not break updater/scanner execution either.
    try { report(event); } catch { /* no secondary sink can be trusted */ }
  };
  if (transport) { /* Managed transport owns its destination and credentials. */ }
  else if (!url && !token) emit("scan_signature_delivery_unconfigured");
  else {
    try {
      const parsed = new URL(url ?? "");
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash ||
          (token && /[\r\n]/.test(token))) throw new Error("Invalid configuration");
      endpoint = parsed.href;
    } catch { emit("scan_signature_delivery_invalid_config"); }
  }

  const queue: string[] = [];
  let active = false;
  let stopped = false;
  let failed = false;
  let controller: AbortController | undefined;
  let wake: (() => void) | undefined;
  const pause = (ms: number) => new Promise<void>((resolve) => {
    const finish = () => { clearTimeout(timer); wake = undefined; resolve(); };
    const timer = setTimeout(finish, ms);
    timer.unref();
    wake = finish;
  });
  async function deliver(body: string) {
    const abort = new AbortController();
    controller = abort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          if (transport) {
            await transport(JSON.parse(body) as SignatureNotice, abort.signal);
            return;
          }
          const response = await send(endpoint!, {
            method: "POST", redirect: "error", signal: abort.signal,
            headers: { "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body,
          });
          // Never read or log collector responses; cancel the stream promptly.
          if (response.body) await response.body.cancel();
          if (!response.ok) throw new Error("Collector rejected notice");
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort.abort();
            reject(new Error("Collector timeout"));
          }, timeoutMs);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      controller = undefined;
    }
  }
  async function drain() {
    active = true;
    try {
      while (!stopped && queue.length) {
        const body = queue[0]!;
        for (let attempt = 0; !stopped; attempt++) {
          try {
            await deliver(body);
            if (stopped) return;
            if (failed) emit("scan_signature_delivery_recovered");
            failed = false;
            break;
          } catch {
            if (stopped) return;
            if (!failed) emit("scan_signature_delivery_failed");
            failed = true;
            if (attempt >= retryDelays.length) {
              emit("scan_signature_delivery_exhausted");
              break;
            }
            await pause(retryDelays[attempt]!);
          }
        }
        queue.shift();
      }
    } finally { active = false; }
  }
  return {
    enqueue(notice: SignatureNotice) {
      if (stopped || (!endpoint && !transport)) return;
      // Bounded, FIFO delivery preserves alert/recovery order during retries.
      if (queue.length >= 16) { emit("scan_signature_delivery_overflow"); return; }
      try { queue.push(JSON.stringify(sanitizeSignatureNotice(notice))); }
      catch { emit("scan_signature_delivery_failed"); return; }
      if (!active) void drain();
    },
    stop() {
      stopped = true;
      queue.length = 0;
      controller?.abort();
      wake?.();
    },
  };
}
