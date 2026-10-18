import { randomUUID } from "node:crypto";
import type { pool } from "@workspace/db";
import type { SbuChatQuota } from "@workspace/api-zod";

export function parseChatDailyLimit(value: string | undefined): number {
  if (value === undefined) return 30;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 1000) {
    throw new Error("SBU_CHAT_DAILY_LIMIT must be an integer from 1 to 1000");
  }
  return Number(value);
}
const DAILY_LIMIT = parseChatDailyLimit(process.env.SBU_CHAT_DAILY_LIMIT);
export type ChatLimitCode = "chat_busy" | "chat_minute_limit" | "chat_daily_limit";
export type ChatReservation = { quota: SbuChatQuota } & (
  { leaseId: string; code?: never } | { code: ChatLimitCode; leaseId?: never }
);
export interface ChatQuotaStore {
  read(userId: string): Promise<SbuChatQuota>;
  reserve(userId: string): Promise<ChatReservation>;
  finish(userId: string, leaseId: string): Promise<SbuChatQuota>;
}

// Database clock + row locks, not process-local counters or app-server clocks.
// A lease outlives the 70s request deadline, recovering crashed instances in 120s.
export function createPostgresChatQuotaStore(database?: typeof pool, dailyLimit = DAILY_LIMIT): ChatQuotaStore {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) throw new Error("Invalid daily quota");
  async function access(userId: string, operation: "read" | "reserve" | "finish", leaseId?: string): Promise<ChatReservation> {
    // Lazy loading also keeps unrelated routes usable without provisioning AI.
    const connectionPool = database ?? (await import("@workspace/db")).pool;
    const client = await connectionPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query(`INSERT INTO sbu_chat_quota(user_id,day_start,minute_start)
        VALUES ($1, to_timestamp(0), to_timestamp(0)) ON CONFLICT (user_id) DO NOTHING`, [userId]);
      const { rows: [row] } = await client.query("SELECT * FROM sbu_chat_quota WHERE user_id=$1 FOR UPDATE", [userId]);
      // Read after acquiring the lock, including when crossing a reset while waiting.
      const { rows: [clock] } = await client.query("SELECT clock_timestamp() AS now");
      const now = new Date(clock.now).getTime();
      const day = Math.floor(now / 86400000) * 86400000;
      const minute = Math.floor(now / 60000) * 60000;
      let dayCount = new Date(row.day_start).getTime() === day ? row.day_count as number : 0;
      let minuteCount = new Date(row.minute_start).getTime() === minute ? row.minute_count as number : 0;
      let activeId: string | null = row.lease_id;
      let activeUntil = row.lease_until ? new Date(row.lease_until).getTime() : 0;
      if (activeUntil <= now || (operation === "finish" && activeId === leaseId)) {
        activeId = null; activeUntil = 0;
      }
      let code: ChatLimitCode | undefined;
      let reserved: string | undefined;
      if (operation === "reserve") {
        if (dayCount >= dailyLimit) code = "chat_daily_limit";
        else if (activeId) code = "chat_busy";
        else if (minuteCount >= 6) code = "chat_minute_limit";
        else {
          dayCount++; minuteCount++;
          reserved = activeId = randomUUID();
          activeUntil = now + 120000;
        }
      }
      await client.query(`UPDATE sbu_chat_quota SET day_start=$2, day_count=$3,
        minute_start=$4, minute_count=$5, lease_id=$6, lease_until=$7 WHERE user_id=$1`,
      [userId, new Date(day), dayCount, new Date(minute), minuteCount, activeId, activeUntil ? new Date(activeUntil) : null]);
      const blockedUntil = Math.max(dayCount >= dailyLimit ? day + 86400000 : 0,
        minuteCount >= 6 ? minute + 60000 : 0, activeUntil);
      const quota: SbuChatQuota = {
        userId, dailyLimit, dailyRemaining: Math.max(0, dailyLimit - dayCount),
        dailyResetAt: new Date(day + 86400000), minuteLimit: 6,
        minuteRemaining: Math.max(0, 6 - minuteCount), minuteResetAt: new Date(minute + 60000),
        busy: !!activeId, retryAfterSeconds: Math.max(0, Math.ceil((blockedUntil - now) / 1000)),
      };
      await client.query("COMMIT");
      return code ? { quota, code } : { quota, leaseId: reserved ?? "" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    read: async (userId) => (await access(userId, "read")).quota,
    reserve: (userId) => access(userId, "reserve"),
    finish: async (userId, leaseId) => (await access(userId, "finish", leaseId)).quota,
  };
}

export const chatQuotaStore = createPostgresChatQuotaStore();
