import { createHash } from "node:crypto";

// One output ceiling for every metered call, including reasoning tokens.
export const BUDGET_MODEL = "gpt-5.6-terra";
export const BUDGET_OUTPUT_TOKENS = 8192;
export const AI_FEATURES = ["assistant", "consultation", "document_analysis"] as const;
export type AiFeature = typeof AI_FEATURES[number];
export type BudgetLimits = Record<"global" | AiFeature, { day: number; month: number }>;
export interface BudgetPolicy {
  fingerprint: string;
  validUntil: Date;
  attemptMicros: number;
  limits: BudgetLimits;
}

// USD microdollars, not credits, subscription entitlements or per-account quotas.
const DEFAULT_LIMITS: BudgetLimits = {
  global: { day: 10_000_000, month: 100_000_000 },
  assistant: { day: 4_000_000, month: 40_000_000 },
  consultation: { day: 3_000_000, month: 30_000_000 },
  document_analysis: { day: 3_000_000, month: 30_000_000 },
};
function integer(value: unknown, max = 1_000_000_000_000): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= max;
}
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

// No guessed provider prices: absent, expired or malformed pricing disables AI.
// Operator must certify these as ceilings inclusive of proxy/provider surcharges.
export function parseBudgetPolicy(pricingJson?: string, limitsJson?: string): BudgetPolicy {
  try {
    const pricing: unknown = JSON.parse(pricingJson ?? "");
    if (!keys(pricing, ["model", "validUntil", "maxInputTokens", "inputMicrosPerMillion", "outputMicrosPerMillion"]) ||
        pricing.model !== BUDGET_MODEL || !integer(pricing.maxInputTokens, 10_000_000) ||
        !integer(pricing.inputMicrosPerMillion) || !integer(pricing.outputMicrosPerMillion) ||
        typeof pricing.validUntil !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(pricing.validUntil)) throw new Error();
    const validUntil = new Date(pricing.validUntil);
    if (!Number.isFinite(validUntil.getTime()) || validUntil.toISOString() !== pricing.validUntil) throw new Error();
    const raw: unknown = limitsJson === undefined ? DEFAULT_LIMITS : JSON.parse(limitsJson);
    const scopes = ["global", ...AI_FEATURES];
    if (!keys(raw, scopes)) throw new Error();
    const limits = {} as BudgetLimits;
    for (const scope of scopes as (keyof BudgetLimits)[]) {
      const limit = raw[scope];
      if (!keys(limit, ["day", "month"]) || !integer(limit.day) || !integer(limit.month) ||
          limit.day > limit.month) throw new Error();
      limits[scope] = { day: limit.day, month: limit.month };
    }
    for (const feature of AI_FEATURES) {
      if (limits[feature].day > limits.global.day || limits[feature].month > limits.global.month) throw new Error();
    }
    // BigInt avoids rounding downward or overflowing before dividing.
    const numerator = BigInt(pricing.maxInputTokens) * BigInt(pricing.inputMicrosPerMillion) +
      BigInt(BUDGET_OUTPUT_TOKENS) * BigInt(pricing.outputMicrosPerMillion);
    const attemptMicros = Number((numerator + 999_999n) / 1_000_000n);
    if (!integer(attemptMicros)) throw new Error();
    const fingerprint = createHash("sha256").update(JSON.stringify({
      model: BUDGET_MODEL, outputTokens: BUDGET_OUTPUT_TOKENS,
      maxInputTokens: pricing.maxInputTokens, input: pricing.inputMicrosPerMillion,
      output: pricing.outputMicrosPerMillion, validUntil: validUntil.toISOString(), limits,
    })).digest("hex");
    return { fingerprint, validUntil, attemptMicros, limits };
  } catch {
    // Never include config values or JSON parser errors in diagnostics.
    throw new Error("AI budget configuration unavailable");
  }
}
