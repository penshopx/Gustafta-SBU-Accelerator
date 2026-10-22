import { randomUUID } from "node:crypto";
import type { pool } from "@workspace/db";

export const DOCUMENT_OPERATION_TIMEOUT_MS = 70_000;
// Longer than the request deadline; crashed processes recover without a heartbeat.
export const DOCUMENT_OPERATION_LEASE_MS = 90_000;
export class DocumentOperationError extends Error {
  constructor(public readonly status: 429 | 503) {
    super(status === 429 ? "document_operation_limited" : "document_operation_unavailable");
  }
}
export type DocumentOperationStore = {
  reserve(ownerId: string, kind: "analysis" | "inspection"): Promise<string>;
  release(ownerId: string, token: string): Promise<void>;
  assertCurrent(ownerId: string, token: string): Promise<void>;
};

export function createDocumentOperationStore(database?: typeof pool): DocumentOperationStore {
  const connection = async () => database ?? (await import("@workspace/db")).pool;
  return {
    async reserve(ownerId, kind) {
      let client: { query: typeof pool.query; release(): void } | undefined;
      try {
        client = await (await connection()).connect();
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query("SET LOCAL statement_timeout = '5s'");
        await client.query(`INSERT INTO sbu_document_analysis_operations(owner_id) VALUES ($1)
          ON CONFLICT DO NOTHING`, [ownerId]);
        const { rows: [row] } = await client.query(
          "SELECT * FROM sbu_document_analysis_operations WHERE owner_id=$1 FOR UPDATE", [ownerId]);
        const { rows: [{ now }] } = await client.query("SELECT clock_timestamp() AS now");
        const time = new Date(now).getTime();
        if (row.token && new Date(row.expires_at).getTime() > time) throw new DocumentOperationError(429);
        const since = kind === "analysis" ? row.analysis_since : row.inspection_since;
        const count = time - new Date(since).getTime() >= 60_000 ? 0 :
          Number(kind === "analysis" ? row.analysis_count : row.inspection_count);
        if (count >= (kind === "analysis" ? 3 : 12)) throw new DocumentOperationError(429);
        const token = randomUUID();
        // Identifiers below come only from this internal enum, never request input.
        const prefix = kind === "analysis" ? "analysis" : "inspection";
        await client.query(`UPDATE sbu_document_analysis_operations SET
          ${prefix}_since=$2, ${prefix}_count=$3, token=$4,
          expires_at=$5::timestamptz + interval '90 seconds' WHERE owner_id=$1`,
        [ownerId, count === 0 ? now : since, count + 1, token, now]);
        await client.query("COMMIT");
        return token;
      } catch (error) {
        await client?.query("ROLLBACK").catch(() => {});
        if (error instanceof DocumentOperationError) throw error;
        // Ambiguous commits are not retried/refunded. Expiry recovers the lease.
        throw new DocumentOperationError(503);
      } finally { client?.release(); }
    },
    async release(ownerId, token) {
      try {
        await (await connection()).query(`UPDATE sbu_document_analysis_operations
          SET token=NULL, expires_at=NULL WHERE owner_id=$1 AND token=$2`, [ownerId, token]);
      } catch {
        // No identifiers, SQL errors, document contents or provider payloads.
        const { logger } = await import("./logger");
        logger.warn({ event: "document_operation_release_failed" }, "Document operation will recover on expiry");
      }
    },
    async assertCurrent(ownerId, token) {
      try {
        const { rowCount } = await (await connection()).query(`SELECT owner_id
          FROM sbu_document_analysis_operations
          WHERE owner_id=$1 AND token=$2 AND expires_at > clock_timestamp()`, [ownerId, token]);
        if (rowCount !== 1) throw new Error();
      } catch { throw new DocumentOperationError(503); }
    },
  };
}
export const documentOperationStore = createDocumentOperationStore();
