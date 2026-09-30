import type { RuangSimpanCompanyProfile } from "@workspace/api-zod";

const CONNECTIONS_ENV = "RUANG_SIMPAN_CONNECTIONS";
const TOKEN_NAME_PATTERN = /^RUANG_SIMPAN_TOKEN_[A-Z0-9_]+$/;
const UPSTREAM_URL = "https://gustafta.my.id/api/v1/ruang-simpan/company-profile";
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

export type ConnectionResult =
  | { kind: "unmapped" }
  | { kind: "unavailable" }
  | { kind: "invalid" }
  | { kind: "insufficient_scope" }
  | { kind: "rate_limited"; retryAfter: string | null }
  | { kind: "source_unavailable" }
  | {
      kind: "ok";
      profile: RuangSimpanCompanyProfile;
    };

function resolveTokenName(ownerId: string): string | null | undefined {
  const raw = process.env[CONNECTIONS_ENV];
  if (raw === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const entries = Object.entries(parsed);
  const tokenNames = new Set<string>();
  const tokenValues = new Set<string>();
  for (const [userId, tokenName] of entries) {
    if (!userId || typeof tokenName !== "string" || !TOKEN_NAME_PATTERN.test(tokenName) ||
      tokenNames.has(tokenName)) {
      return null;
    }
    tokenNames.add(tokenName);
    const tokenValue = process.env[tokenName];
    if (typeof tokenValue === "string" && tokenValue.length > 0) {
      if (tokenValues.has(tokenValue)) return null;
      tokenValues.add(tokenValue);
    }
  }

  return Object.prototype.hasOwnProperty.call(parsed, ownerId)
    ? (parsed as Record<string, string>)[ownerId]
    : undefined;
}

function validIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59 ||
    (match[8] !== undefined && (Number(match[8]) > 23 || Number(match[9]) > 59)) ||
    !Number.isFinite(Date.parse(value))) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isProfile(value: unknown): value is RuangSimpanCompanyProfile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.name === "string" &&
    typeof profile.nib === "string" &&
    typeof profile.address === "string" &&
    typeof profile.revision === "number" &&
    Number.isSafeInteger(profile.revision) &&
    profile.revision >= 0 &&
    (profile.updated_at === null || validIsoTimestamp(profile.updated_at));
}

function cancelResponseBody(response: Response): void {
  if (!response.body) return;
  try {
    void response.body.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best effort; do not let an upstream stream replace a
    // deliberately sanitized local response.
  }
}

function readWithSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]> {
  if (signal.aborted) {
    void reader.cancel().catch(() => undefined);
    return Promise.reject(new Error("Upstream request aborted"));
  }
  return new Promise((resolve, reject) => {
    const removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      removeAbortListener();
      void reader.cancel().catch(() => undefined);
      reject(new Error("Upstream request aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (chunk) => {
        removeAbortListener();
        resolve(chunk);
      },
      (error: unknown) => {
        removeAbortListener();
        reject(error);
      },
    );
  });
}

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await readWithSignal(reader, signal);
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // An aborted stream may still be settling its pending read.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function fetchRuangSimpanProfile(
  ownerId: string,
  clientSignal?: AbortSignal,
): Promise<ConnectionResult> {
  const tokenName = resolveTokenName(ownerId);
  if (tokenName === undefined) return { kind: "unmapped" };
  if (tokenName === null) return { kind: "unavailable" };
  const token = process.env[tokenName];
  if (typeof token !== "string" || token.length === 0) return { kind: "unavailable" };

  const controller = new AbortController();
  const onClientAbort = () => controller.abort();
  if (clientSignal?.aborted) return { kind: "source_unavailable" };
  clientSignal?.addEventListener("abort", onClientAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(UPSTREAM_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (response.status === 401) {
      cancelResponseBody(response);
      return { kind: "invalid" };
    }
    if (response.status === 403) {
      cancelResponseBody(response);
      return { kind: "insufficient_scope" };
    }
    if (response.status === 429) {
      const rawRetryAfter = response.headers.get("retry-after");
      const retryAfter = rawRetryAfter && /^\d+$/.test(rawRetryAfter) &&
        Number.isSafeInteger(Number(rawRetryAfter))
        ? String(Number(rawRetryAfter))
        : null;
      cancelResponseBody(response);
      return { kind: "rate_limited", retryAfter };
    }
    if (response.status !== 200) {
      cancelResponseBody(response);
      return { kind: "source_unavailable" };
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
      cancelResponseBody(response);
      return { kind: "source_unavailable" };
    }

    const body = await readBoundedBody(response, controller.signal);
    if (body === null) return { kind: "source_unavailable" };

    const decoded: unknown = JSON.parse(body);
    if (!isProfile(decoded)) {
      return { kind: "source_unavailable" };
    }

    return {
      kind: "ok",
      profile: {
        name: decoded.name,
        nib: decoded.nib,
        address: decoded.address,
        revision: decoded.revision,
        updated_at: decoded.updated_at,
      },
    };
  } catch {
    return { kind: "source_unavailable" };
  } finally {
    clearTimeout(timeout);
    clientSignal?.removeEventListener("abort", onClientAbort);
  }
}