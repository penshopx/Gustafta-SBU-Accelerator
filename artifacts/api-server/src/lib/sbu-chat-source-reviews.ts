import type { pool } from "@workspace/db";
import { isDeepStrictEqual } from "node:util";
import type { SbuChatSourceDecision, SbuChatSourceReviewInput } from "@workspace/api-zod";
import { CHAT_SOURCE_VERSIONS, type ChatSourceVersion } from "./sbu-chat-retrieval";

type ReviewPool = Pick<typeof pool, "query" | "connect">;
export class SourceReviewConflict extends Error {}
export class InvalidSourceReview extends Error {}

export function createChatSourceReviewStore(connection?: ReviewPool, versions = CHAT_SOURCE_VERSIONS) {
  // The catalog is deployed code, never arbitrary text submitted by a reviewer.
  // In particular this interface cannot admit a BG001 draft or elevate verified scope.
  const catalog = structuredClone(versions);
  if (new Set(catalog.map(v => `${v.sourceKey}/${v.versionId}`)).size !== catalog.length ||
      new Set(catalog.flatMap(v => v.citations.map(c => c.id))).size !== catalog.flatMap(v => v.citations).length ||
      catalog.some(v => v.citations.some(c => !c.id.endsWith(`@${v.versionId}`))) ||
      catalog.some(v => catalog.filter(other => other.sourceKey === v.sourceKey && other.baseline).length !== 1)) {
    throw new Error("invalid_source_catalog");
  }
  const readDecisions = async (): Promise<SbuChatSourceDecision[]> => {
    // Like quota storage, resolve persistence only for routes that use it.
    // Loading unrelated assessment/auth routes must not require a pool adapter.
    const database = connection ?? (await import("@workspace/db")).pool;
    const result = await database.query(`
      SELECT source_key AS "sourceKey", version_id AS "versionId", revision,
        expected_revision AS "expectedRevision", status, reason,
        review_reference AS "reviewReference", reviewed_by AS "reviewedBy",
        decided_at AS "decidedAt", citations
      FROM sbu_chat_source_decisions ORDER BY source_key, revision`);
    return result.rows.map(row => ({ ...row, decidedAt: row.decidedAt.toISOString() }));
  };
  return {
    async read() {
      return { versions: structuredClone(catalog).map(({ keywords: _keywords, ...v }) => v), decisions: await readDecisions() };
    },
    async active(): Promise<ChatSourceVersion[]> {
      const decisions = await readDecisions(); // No process-local cache or fallback on database failure.
      const latest = new Map(decisions.map(d => [d.sourceKey, d]));
      return structuredClone(catalog.filter(version => {
        const decision = latest.get(version.sourceKey);
        if (!decision) return version.baseline;
        // A changed/missing historical catalog entry fails closed, not back to baseline.
        return decision.status === "approved" && decision.versionId === version.versionId &&
          isDeepStrictEqual(decision.citations, version.citations);
      }));
    },
    async record(input: SbuChatSourceReviewInput, reviewedBy: string): Promise<SbuChatSourceDecision> {
      const version = catalog.find(v => v.sourceKey === input.sourceKey && v.versionId === input.versionId);
      if (!version || !reviewedBy.trim() || !input.reason.trim() || !input.reviewReference.trim() ||
          !["approved", "withdrawn", "not_approved"].includes(input.status) ||
          !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
        throw new InvalidSourceReview();
      }
      const database = connection ?? (await import("@workspace/db")).pool;
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        // Shared by all instances; protects the first review too (no row yet to lock).
        await client.query("SELECT pg_advisory_xact_lock(201, hashtext($1))", [input.sourceKey]);
        const { rows } = await client.query(
          "SELECT revision, version_id FROM sbu_chat_source_decisions WHERE source_key=$1 ORDER BY revision DESC LIMIT 1",
          [input.sourceKey]);
        if ((rows[0]?.revision ?? 0) !== input.expectedRevision) throw new SourceReviewConflict();
        const currentVersion = rows[0]?.version_id ?? catalog.find(v => v.sourceKey === input.sourceKey && v.baseline)!.versionId;
        if (input.status !== "approved" && input.versionId !== currentVersion) throw new InvalidSourceReview();
        const { rows: [saved] } = await client.query(`
          INSERT INTO sbu_chat_source_decisions
            (source_key, revision, version_id, expected_revision, status, reason, review_reference, reviewed_by, citations)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING decided_at`,
        [input.sourceKey, input.expectedRevision + 1, input.versionId, input.expectedRevision,
          input.status, input.reason.trim(), input.reviewReference.trim(), reviewedBy, JSON.stringify(version.citations)]);
        await client.query("COMMIT");
        return { ...input, reason: input.reason.trim(), reviewReference: input.reviewReference.trim(),
          revision: input.expectedRevision + 1, reviewedBy, decidedAt: saved.decided_at.toISOString(),
          citations: structuredClone([...version.citations]) };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
  };
}

export type ChatSourceReviewStore = ReturnType<typeof createChatSourceReviewStore>;
export const chatSourceReviewStore = createChatSourceReviewStore();
