import type { pool } from "@workspace/db";
import {
  AI_FEATURES, BUDGET_MODEL, modelAttemptMicros, parseBudgetPolicy,
  type AiFeature, type BudgetPolicy,
} from "./ai-budget-policy";

export type AiBudgetAvailability = {
  status: "available" | "exhausted" | "unavailable";
  checkedAt: string;
  nextResetAt: string | null;
};
export type ReadAiBudgetAvailability = (feature: AiFeature, model: string) => Promise<AiBudgetAvailability>;

// This advisory read never registers prices, reserves funds, or changes flags.
// The send path still performs its existing atomic reservation independently.
export function createAiBudgetAvailabilityReader(
  database?: typeof pool,
  policy: () => BudgetPolicy = () => parseBudgetPolicy(
    process.env.AI_BUDGET_PRICING_JSON, process.env.AI_BUDGET_LIMITS_JSON,
    process.env.AI_BUDGET_CLAUDE_PRICING_JSON),
): ReadAiBudgetAvailability {
  return async (feature, model) => {
    let client: { query: typeof pool.query; release(): void } | undefined;
    let checkedAt = new Date().toISOString();
    try {
      if (!AI_FEATURES.includes(feature)) throw new Error();
      const config = policy();
      const pricing = config.models[model];
      if (!pricing) throw new Error();
      const cost = modelAttemptMicros(pricing);
      client = await (database ?? (await import("@workspace/db")).pool).connect();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const { rows: [clock] } = await client.query("SELECT clock_timestamp() AS now, id FROM ai_budget_lock WHERE id=1");
      if (!clock) throw new Error();
      const now = new Date(clock.now);
      checkedAt = now.toISOString();
      if (now >= pricing.validUntil) throw new Error();
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const reset = {
        day: new Date(day.getTime() + 86_400_000),
        month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      };
      const { rows: counters } = await client.query(`SELECT scope, period, policy_fingerprint, reserved_micros
        FROM ai_budget_counters WHERE scope=ANY($1::text[]) AND
        ((period='day' AND period_start=$2) OR (period='month' AND period_start=$3))`,
      [["global", feature], day, month]);
      const { rows: policies } = await client.query(`SELECT model, period, pricing_fingerprint
        FROM ai_budget_model_policies WHERE model=ANY($1::text[]) AND
        ((period='day' AND period_start=$2) OR (period='month' AND period_start=$3))`,
      [[model, BUDGET_MODEL], day, month]);
      const checkPrices = (selected: string, period: string) => {
        const known = config.models[selected];
        const row = policies.find(item => item.model === selected && item.period === period);
        if (!known || (row && row.pricing_fingerprint !== known.fingerprint)) throw new Error();
      };
      for (const period of ["day", "month"]) checkPrices(model, period);
      const blocked: { period: "day" | "month"; limit: number }[] = [];
      for (const scope of ["global", feature] as const) {
        for (const period of ["day", "month"] as const) {
          const row = counters.find(item => item.scope === scope && item.period === period);
          if (row && row.policy_fingerprint !== config.fingerprint) {
            if (!config.legacyFingerprint || row.policy_fingerprint !== config.legacyFingerprint) throw new Error();
            checkPrices(BUDGET_MODEL, period);
          }
          const reserved = row ? Number(row.reserved_micros) : 0;
          if (!Number.isSafeInteger(reserved) || reserved < 0) throw new Error();
          const limit = config.limits[scope][period];
          if (reserved + cost > limit) blocked.push({ period, limit });
        }
      }
      await client.query("COMMIT");
      return {
        status: blocked.length ? "exhausted" : "available",
        checkedAt,
        // A limit smaller than one reservation needs operator action, not a reset.
        nextResetAt: blocked.length && blocked.every(item => cost <= item.limit)
          ? new Date(Math.max(...blocked.map(item => reset[item.period].getTime()))).toISOString() : null,
      };
    } catch {
      await client?.query("ROLLBACK").catch(() => {});
      return { status: "unavailable", checkedAt, nextResetAt: null };
    } finally {
      client?.release();
    }
  };
}

export const readAiBudgetAvailability = createAiBudgetAvailabilityReader();
