import type { pool } from "@workspace/db";
import {
  AI_FEATURES, BUDGET_MODEL, modelAttemptMicros, parseBudgetPolicy,
  type AiFeature, type BudgetPolicy, type ModelBudgetPricing,
} from "./ai-budget-policy";

export class AiBudgetError extends Error {
  constructor(public readonly code: "ai_budget_exhausted" | "ai_budget_unavailable") {
    super(code === "ai_budget_exhausted"
      ? "Batas anggaran operasional AI tercapai. Tidak ada permintaan AI yang dikirim; coba lagi setelah anggaran tersedia."
      : "Anggaran operasional AI belum dapat diverifikasi. Tidak ada permintaan AI yang dikirim; coba lagi nanti.");
  }
}
export type ReserveAiBudget = (feature: AiFeature, model?: string) => Promise<void>;
export type BudgetEvent = {
  event: "ai_budget_warning" | "ai_budget_rejected" | "ai_budget_unavailable";
  scope?: "global" | AiFeature;
  period?: "day" | "month";
  reservedMicros?: number;
  limitMicros?: number;
};
type Emit = (event: BudgetEvent) => void | Promise<void>;
const emit: Emit = async event => {
  const { logger } = await import("./logger");
  if (event.event === "ai_budget_unavailable") logger.error(event, "AI budget unavailable; request blocked");
  else logger.warn(event, "AI operational budget threshold");
};

// Each instance uses the same PostgreSQL rows. No refunds: cancellation, provider
// failure, unknown outcomes and process crashes may still be billable.
export function createPostgresAiBudgetStore(
  database?: typeof pool,
  policy: () => BudgetPolicy = () => parseBudgetPolicy(
    process.env.AI_BUDGET_PRICING_JSON, process.env.AI_BUDGET_LIMITS_JSON,
    process.env.AI_BUDGET_CLAUDE_PRICING_JSON),
  report: Emit = emit,
): { reserve: ReserveAiBudget } {
  return {
    async reserve(feature, requestedModel = BUDGET_MODEL) {
      let client: { query: typeof pool.query; release(): void } | undefined;
      const events: BudgetEvent[] = [];
      try {
        if (!AI_FEATURES.includes(feature)) throw new Error();
        const config = policy();
        const modelPricing = config.models[requestedModel];
        if (!modelPricing) throw new Error();
        const attemptMicros = modelAttemptMicros(modelPricing);
        const connectionPool = database ?? (await import("@workspace/db")).pool;
        client = await connectionPool.connect();
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query("SET LOCAL statement_timeout = '5s'");
        // Data initialization only, never schema migration. The unique key makes
        // concurrent first reservations wait for the same committed row. Keep
        // this in the reservation transaction so failed attempts roll it back.
        await client.query("INSERT INTO ai_budget_lock(id) VALUES (1) ON CONFLICT DO NOTHING");
        // Database-wide row, stable across day/month boundaries, serializes all
        // instances. Acquire before reading the database clock (including reset).
        const { rows: [lock] } = await client.query("SELECT id FROM ai_budget_lock WHERE id=1 FOR UPDATE");
        if (!lock) throw new Error();
        const { rows: [clock] } = await client.query(`SELECT clock_timestamp() AS now`);
        if (new Date(clock.now).getTime() >= modelPricing.validUntil.getTime()) throw new Error();
        const { rows: periods } = await client.query(`
          SELECT 'month' AS period, date_trunc('month', $1::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start
          UNION ALL SELECT 'day', date_trunc('day', $1::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [clock.now]);
        const transaction = client;
        const registerModelPricing = async (pricing: ModelBudgetPricing, period: string, start: Date) => {
            await transaction.query(`INSERT INTO ai_budget_model_policies(model,period,period_start,pricing_fingerprint)
              VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [pricing.model, period, start, pricing.fingerprint]);
            const { rows: [row] } = await transaction.query(`SELECT pricing_fingerprint FROM ai_budget_model_policies
              WHERE model=$1 AND period=$2 AND period_start=$3 FOR UPDATE`, [pricing.model, period, start]);
            // Price updates during an active period fail closed without resetting
            // already reserved USD. Different model prices remain independently tracked.
            if (!row || row.pricing_fingerprint !== pricing.fingerprint) throw new Error();
        };
        for (const { period, start } of periods as { period: "day" | "month"; start: Date }[]) {
          await registerModelPricing(modelPricing, period, start);
        }
        const counters: {
          scope: "global" | AiFeature; period: "day" | "month"; start: Date;
          reserved: number; limit: number; warned: boolean; rejected: boolean;
        }[] = [];
        for (const scope of ["global", feature] as const) {
          for (const { period, start } of periods as { period: "day" | "month"; start: Date }[]) {
            await client.query(`INSERT INTO ai_budget_counters(scope,period,period_start,policy_fingerprint)
              VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [scope, period, start, config.fingerprint]);
            const { rows: [row] } = await client.query(`SELECT * FROM ai_budget_counters
              WHERE scope=$1 AND period=$2 AND period_start=$3 FOR UPDATE`, [scope, period, start]);
            if (row.policy_fingerprint !== config.fingerprint) {
              // Adopt a known legacy GPT policy without resetting any USD
              // reservation or notification flag. Unknown history stays blocked.
              const legacy = config.models[BUDGET_MODEL];
              if (!legacy || row.policy_fingerprint !== config.legacyFingerprint) throw new Error();
              await registerModelPricing(legacy, period, start);
              await client.query(`UPDATE ai_budget_counters SET policy_fingerprint=$4
                WHERE scope=$1 AND period=$2 AND period_start=$3`,
              [scope, period, start, config.fingerprint]);
            }
            counters.push({ scope, period, start, reserved: Number(row.reserved_micros),
              limit: config.limits[scope][period], warned: row.warned, rejected: row.rejected });
          }
        }
        const blocked = counters.filter(c => c.reserved + attemptMicros > c.limit);
        if (blocked.length) {
          for (const c of blocked) {
            if (!c.rejected) {
              await client.query(`UPDATE ai_budget_counters SET rejected=true
                WHERE scope=$1 AND period=$2 AND period_start=$3`, [c.scope, c.period, c.start]);
              events.push({ event: "ai_budget_rejected", scope: c.scope, period: c.period,
                reservedMicros: c.reserved, limitMicros: c.limit });
            }
          }
        } else {
          for (const c of counters) {
            const reserved = c.reserved + attemptMicros;
            const warn = reserved >= Math.ceil(c.limit * 0.8);
            await client.query(`UPDATE ai_budget_counters SET reserved_micros=$4, warned=warned OR $5
              WHERE scope=$1 AND period=$2 AND period_start=$3`,
            [c.scope, c.period, c.start, reserved, warn]);
            if (warn && !c.warned) events.push({ event: "ai_budget_warning", scope: c.scope,
              period: c.period, reservedMicros: reserved, limitMicros: c.limit });
          }
        }
        // No provider request until all four increments have committed.
        await client.query("COMMIT");
        for (const event of events) await report(event);
        if (blocked.length) throw new AiBudgetError("ai_budget_exhausted");
      } catch (error) {
        await client?.query("ROLLBACK").catch(() => {});
        if (error instanceof AiBudgetError) throw error;
        try { await report({ event: "ai_budget_unavailable" }); } catch { /* Never expose reporter errors. */ }
        throw new AiBudgetError("ai_budget_unavailable");
      } finally {
        client?.release();
      }
    },
  };
}

export const reserveAiBudget: ReserveAiBudget = createPostgresAiBudgetStore().reserve;
