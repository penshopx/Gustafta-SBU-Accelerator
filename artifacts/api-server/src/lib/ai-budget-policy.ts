import { createHash } from "node:crypto";

// One output ceiling for every metered call, including reasoning tokens.
export const BUDGET_MODEL = "gpt-5.6-terra";
export const BUDGET_OUTPUT_TOKENS = 8192;
export const AI_FEATURES = ["assistant", "consultation", "document_analysis"] as const;
export type AiFeature = typeof AI_FEATURES[number];
export type BudgetLimits = Record<"global" | AiFeature, { day: number; month: number }>;
export type ModelBudgetPricing = {
  model: string;
  validUntil: Date;
  maxInputTokens: number;
  inputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
  fingerprint: string;
};
export interface BudgetPolicy {
  // Aggregate rows contain USD reservations, independent of provider pricing.
  fingerprint: string;
  legacyFingerprint?: string;
  validUntil: Date;
  attemptMicros: number;
  limits: BudgetLimits;
  models: Readonly<Record<string, ModelBudgetPricing>>;
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
export function modelAttemptMicros(pricing: ModelBudgetPricing): number {
  const numerator = BigInt(pricing.maxInputTokens) * BigInt(pricing.inputMicrosPerMillion) +
    BigInt(BUDGET_OUTPUT_TOKENS) * BigInt(pricing.outputMicrosPerMillion);
  const result = Number((numerator + 999_999n) / 1_000_000n);
  if (!integer(result)) throw new Error("AI budget configuration unavailable");
  return result;
}

export function parseBudgetPolicy(
  pricingJson?: string,
  limitsJson?: string,
  claudePricingJson?: string | null,
): BudgetPolicy {
  try {
    const parsePricing = (rawJson: string | undefined, expectedModel?: string): Omit<ModelBudgetPricing, "fingerprint"> => {
      const raw: unknown = JSON.parse(rawJson ?? "");
      if (!keys(raw, ["model", "validUntil", "maxInputTokens", "inputMicrosPerMillion", "outputMicrosPerMillion"]) ||
          typeof raw.model !== "string" || (expectedModel && raw.model !== expectedModel) ||
          !/^[a-z0-9][a-z0-9._-]{1,100}$/.test(raw.model) ||
          !integer(raw.maxInputTokens, 10_000_000) ||
          !integer(raw.inputMicrosPerMillion) || !integer(raw.outputMicrosPerMillion) ||
          typeof raw.validUntil !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(raw.validUntil)) throw new Error();
      const validUntil = new Date(raw.validUntil);
      if (!Number.isFinite(validUntil.getTime()) || validUntil.toISOString() !== raw.validUntil) throw new Error();
      return {
        model: raw.model,
        validUntil,
        maxInputTokens: raw.maxInputTokens,
        inputMicrosPerMillion: raw.inputMicrosPerMillion,
        outputMicrosPerMillion: raw.outputMicrosPerMillion,
      };
    };
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
    const models: Record<string, ModelBudgetPricing> = {};
    for (const [json, expectedModel] of [
      [pricingJson, BUDGET_MODEL],
      [claudePricingJson, "claude-sonnet-5-5"],
    ] as const) {
      if (json === undefined || json === null) continue;
      // An invalid provider policy disables that model, not unrelated providers.
      try {
        const pricing = parsePricing(json, expectedModel);
        const modelFingerprint = createHash("sha256").update(JSON.stringify({
          model: pricing.model, outputTokens: BUDGET_OUTPUT_TOKENS,
          maxInputTokens: pricing.maxInputTokens, input: pricing.inputMicrosPerMillion,
          output: pricing.outputMicrosPerMillion, validUntil: pricing.validUntil.toISOString(),
        })).digest("hex");
        modelAttemptMicros({ ...pricing, fingerprint: modelFingerprint });
        models[pricing.model] = { ...pricing, fingerprint: modelFingerprint };
      } catch {
        // Missing model membership fails closed before a provider call.
      }
    }
    const primary = models[BUDGET_MODEL] ?? models["claude-sonnet-5-5"];
    if (!primary) throw new Error();
    const fingerprint = createHash("sha256").update(JSON.stringify({ version: 2, limits })).digest("hex");
    const legacy = models[BUDGET_MODEL];
    const legacyFingerprint = legacy ? createHash("sha256").update(JSON.stringify({
      model: BUDGET_MODEL, outputTokens: BUDGET_OUTPUT_TOKENS,
      maxInputTokens: legacy.maxInputTokens, input: legacy.inputMicrosPerMillion,
      output: legacy.outputMicrosPerMillion, validUntil: legacy.validUntil.toISOString(), limits,
    })).digest("hex") : undefined;
    return {
      fingerprint, legacyFingerprint, validUntil: primary.validUntil,
      attemptMicros: modelAttemptMicros(primary), limits, models,
    };
  } catch {
    // Never include config values or JSON parser errors in diagnostics.
    throw new Error("AI budget configuration unavailable");
  }
}
