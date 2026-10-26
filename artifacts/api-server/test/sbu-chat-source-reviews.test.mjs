import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import express from "express";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(dir, ".source-reviews-"));
const { Pool } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = `reviews_${randomUUID().replaceAll("-", "")}`;
let first, second;
after(async () => {
  try {
    await first?.close();
    await second?.close();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.end();
    await rm(temp, { recursive: true, force: true });
  }
});
await admin.query(`CREATE SCHEMA "${schema}"`);
const bootstrap = await admin.connect();
try {
  await bootstrap.query(`SET search_path TO "${schema}"`);
  const sql = await readFile(new URL("../../../lib/db/migrations/chat-source-reviews.sql", import.meta.url), "utf8");
  await bootstrap.query(sql);
  await bootstrap.query(sql); // Startup migration is repeatable.
} finally { await bootstrap.query("RESET search_path"); bootstrap.release(); }
first = await createRestrictedRoutePool(admin, schema);
second = await createRestrictedRoutePool(admin, schema);
globalThis.__sourceReviewPool = first.pool;
await build({
  stdin: {
    contents: `
      export * from "../src/lib/sbu-chat-source-reviews";
      export * from "../src/lib/sbu-chat-retrieval";
      export * from "../src/routes/sbu-chat";
    `, resolveDir: dir, sourcefile: "source-review-fixture.ts",
  },
  outfile: join(temp, "fixture.mjs"), bundle: true, platform: "node", format: "esm",
  external: ["express", "@workspace/integrations-openai-ai-server"],
  plugins: [{
    name: "isolated-source-review-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk", namespace: "fixture" }));
      builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
        path: fileURLToPath(new URL("../../../lib/api-zod/src/index.ts", import.meta.url)),
      }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: path === "db" ? "export const pool = globalThis.__sourceReviewPool;"
          : "export const getAuth = req => ({ userId: req.get('X-Test-Identity') ?? null });",
        loader: "js",
      }));
    },
  }],
});
const { createChatSourceReviewStore, createSbuChatRouter, CHAT_SOURCE_VERSIONS,
  retrieveChatSources, validateCitedAnswer, SourceReviewConflict, InvalidSourceReview } = await import(join(temp, "fixture.mjs"));

// Synthetic replacement of the same bounded preparation snapshot, not a new
// legal conclusion or a production approval of a future version.
const baseline = CHAT_SOURCE_VERSIONS[0];
const replacement = {
  ...structuredClone(baseline), versionId: "pu6-fixture-r2", baseline: false,
  citations: baseline.citations.map(c => ({ ...c, id: c.id.replace(baseline.versionId, "pu6-fixture-r2"), version: `${c.version}; fixture replacement` })),
  keywords: Object.fromEntries(Object.entries(baseline.keywords).map(([id, terms]) => [id.replace(baseline.versionId, "pu6-fixture-r2"), terms])),
};
const catalog = [...CHAT_SOURCE_VERSIONS, replacement];
const store = createChatSourceReviewStore(first.pool, catalog);
const other = createChatSourceReviewStore(second.pool, catalog);
const input = (expectedRevision, status = "approved", versionId = replacement.versionId) => ({
  sourceKey: baseline.sourceKey, versionId, expectedRevision, status,
  reason: "Telaah sintetis untuk regresi terbatas", reviewReference: "fixture-review-evidence",
});
const raw = id => JSON.stringify({ answer: `Ringkasan terbatas [${id}]`, citationIds: [id] });

test("reviewed replacement is visible on another instance; old citation IDs and altered snapshots fail closed", async () => {
  const before = retrieveChatSources("SMAP Permen berlaku", await store.active());
  assert.ok(before.some(c => c.id.includes(baseline.versionId)));
  assert.ok(!before.some(c => c.id.includes(replacement.versionId)));
  const decision = await store.record(input(0), "trusted-reviewer");
  assert.equal(decision.revision, 1);
  assert.equal(decision.reviewedBy, "trusted-reviewer");
  const current = retrieveChatSources("SMAP Permen berlaku", await other.active());
  assert.ok(current.some(c => c.id.includes(replacement.versionId)));
  assert.ok(!current.some(c => c.id.includes(baseline.versionId)));
  const olderServer = createChatSourceReviewStore(second.pool, CHAT_SOURCE_VERSIONS);
  assert.ok(!(await olderServer.active()).some(v => v.sourceKey === baseline.sourceKey),
    "a server without the replacement must not fall back to baseline during a rolling deployment");
  assert.throws(() => validateCitedAnswer(raw(before[0].id), current), /citation_not_retrieved/);
  const fresh = current.find(c => c.id.includes(replacement.versionId));
  assert.equal(validateCitedAnswer(raw(fresh.id), current).citations[0].id, fresh.id);
  assert.equal(fresh.verificationScope, baseline.citations.find(c => c.locator === fresh.locator).verificationScope);
  const tampered = structuredClone(catalog);
  tampered.at(-1).citations[0].excerpt = "Changed content without a new version";
  assert.ok(!(await createChatSourceReviewStore(second.pool, tampered).active()).some(v => v.versionId === replacement.versionId));
  const read = await store.read();
  read.versions[0].citations[0].excerpt = "caller mutation";
  assert.notEqual((await store.read()).versions[0].citations[0].excerpt, "caller mutation");
});

test("concurrent review writers cannot silently overwrite a decision; withdrawal never falls back to baseline", async () => {
  const results = await Promise.allSettled([
    store.record(input(1, "withdrawn"), "reviewer-a"),
    other.record(input(1, "not_approved"), "reviewer-b"),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.ok(results.find(r => r.status === "rejected").reason instanceof SourceReviewConflict);
  const active = await other.active();
  assert.deepEqual(active.map(v => v.sourceKey), ["kepdirjen-281-2026"]);
  assert.deepEqual(retrieveChatSources("permen berlaku", active), []);
  assert.deepEqual(retrieveChatSources("modal personel BG001 K1", active), []);
  const read = await store.read();
  assert.equal(read.decisions.length, 2);
  assert.deepEqual(read.decisions.map(d => d.revision), [1, 2]);
  assert.equal(read.decisions[0].citations[0].id, replacement.citations[0].id);
  for (const sql of [
    "UPDATE sbu_chat_source_decisions SET reason='changed'",
    "DELETE FROM sbu_chat_source_decisions",
    "TRUNCATE sbu_chat_source_decisions",
  ]) await assert.rejects(first.pool.query(sql));
  await assert.rejects(store.record({ ...input(2), versionId: "bg001-draft" }, "reviewer"), InvalidSourceReview);
  await assert.rejects(store.record({ ...input(2), reviewReference: " " }, "reviewer"), InvalidSourceReview);
  await assert.rejects(store.record(input(2, "withdrawn", baseline.versionId), "reviewer"), InvalidSourceReview);
});

test("review API authenticates actor and owner, fails closed without allowlist, preserves audit, and does not admit arbitrary text", async () => {
  const previous = process.env.SBU_VERIFIER_USER_IDS;
  process.env.SBU_VERIFIER_USER_IDS = "trusted-reviewer";
  let calls = 0;
  const quota = { reserve: async () => { calls++; return { leaseId: "fixture", quota: {} }; },
    read: async () => ({}), finish: async () => ({}) };
  const app = express();
  app.use(express.json());
  app.use(createSbuChatRouter(async () => raw(replacement.citations[0].id), quota, store, async () => {}));
  const listener = app.listen(0, "127.0.0.1");
  await new Promise(resolve => listener.once("listening", resolve));
  const url = `http://127.0.0.1:${listener.address().port}/openai/sbu/source-reviews`;
  const send = (data, user = "trusted-reviewer", owner = user) => fetch(url, {
    method: data ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(user ? { "X-Test-Identity": user } : {}),
      ...(owner ? { "X-SBU-Form-Owner": owner } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  try {
    assert.equal((await send(input(2), null)).status, 401);
    assert.equal((await send(input(2), "ordinary-user")).status, 403);
    assert.equal((await send(input(2), "trusted-reviewer", "old-user")).status, 409);
    assert.equal((await send(undefined, "ordinary-user")).status, 403);
    process.env.SBU_VERIFIER_USER_IDS = "";
    assert.equal((await send(input(2))).status, 403);
    process.env.SBU_VERIFIER_USER_IDS = "trusted-reviewer";
    assert.equal((await send({ ...input(2), reviewedBy: "forged" })).status, 400);
    assert.equal((await send({ ...input(2), citations: [] })).status, 400);
    assert.equal((await send({ ...input(2), reason: " " })).status, 400);
    assert.equal((await send({ ...input(2), versionId: "bg001-draft" })).status, 400);
    assert.equal((await send(input(1))).status, 409);
    const response = await send(input(2, "not_approved"));
    assert.equal(response.status, 201);
    const decision = await response.json();
    assert.equal(decision.reviewedBy, "trusted-reviewer");
    assert.equal(decision.revision, 3);
    const history = await send();
    assert.equal(history.status, 200);
    assert.match(history.headers.get("cache-control"), /no-store/);
    assert.equal((await history.json()).decisions.length, 3);
    assert.equal(calls, 0, "source decisions do not use AI or change its quota");
  } finally {
    if (previous === undefined) delete process.env.SBU_VERIFIER_USER_IDS;
    else process.env.SBU_VERIFIER_USER_IDS = previous;
    listener.closeAllConnections();
    await new Promise(resolve => listener.close(resolve));
  }
});

test("chat route reads decisions for each request and rejects retired IDs/history and changes during generation", async () => {
  await store.record(input(3), "reviewer");
  let providerCalls = 0, reserveCalls = 0;
  let generate = async sources => raw(sources.find(s => s.id.includes(replacement.versionId)).id);
  const quotaSnapshot = { userId: "owner", dailyLimit: 30, dailyRemaining: 29,
    dailyResetAt: "2026-10-21T00:00:00Z", minuteLimit: 6, minuteRemaining: 5,
    minuteResetAt: "2026-10-20T00:01:00Z", busy: false, retryAfterSeconds: 0 };
  const quotas = { read: async () => quotaSnapshot,
    reserve: async () => { reserveCalls++; return { leaseId: "lease", quota: quotaSnapshot }; },
    finish: async () => quotaSnapshot };
  let unavailable = false;
  const live = { ...store, active: async () => {
    if (unavailable) throw Error("private database payload");
    return other.active();
  } };
  const app = express();
  app.use(express.json());
  app.use(createSbuChatRouter(async (_mode, _messages, _signal, _specialist, _context, sources) => {
    providerCalls++;
    return generate(sources);
  }, quotas, live, async () => {}));
  const listener = app.listen(0, "127.0.0.1");
  await new Promise(resolve => listener.once("listening", resolve));
  const url = `http://127.0.0.1:${listener.address().port}/openai/sbu/messages`;
  const send = (messages = [{ role: "user", content: "Status Permen berlaku" }]) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Test-Identity": "owner", "X-SBU-Form-Owner": "owner" },
    body: JSON.stringify({ mode: "bujk", specialist: "sbuclaw", consent: true, providerConsent: "anthropic-claude-sonnet-5-5-v1", messages }),
  });
  try {
    let response = await send();
    assert.equal(response.status, 200);
    assert.ok((await response.json()).citations[0].id.includes(replacement.versionId));
    generate = async () => raw(baseline.citations[0].id);
    assert.equal((await send()).status, 503, "old version is rejected even though the same document/topic was retrieved");
    generate = async sources => {
      await store.record(input(4, "withdrawn"), "reviewer");
      return raw(sources[0].id);
    };
    response = await send();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /Ringkasan terbatas|pu6-fixture/);
    generate = async sources => {
      assert.deepEqual(sources, []);
      return raw(replacement.citations[0].id);
    };
    assert.equal((await send([
      { role: "user", content: "Status Permen berlaku" },
      { role: "assistant", content: `Riwayat [${replacement.citations[0].id}]` },
      { role: "user", content: "Status Permen berlaku" },
    ])).status, 503);
    generate = async () => JSON.stringify({ answer: "Belum terverifikasi; tinjau sumber resmi.", citationIds: [] });
    assert.equal((await send()).status, 200, "next request can safely answer without the withdrawn document");
    generate = async () => {
      unavailable = true;
      return JSON.stringify({ answer: "Belum terverifikasi.", citationIds: [] });
    };
    assert.equal((await send()).status, 503, "a failed post-generation review check rejects even an uncited answer");
    unavailable = true;
    const before = [providerCalls, reserveCalls];
    response = await send();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private database payload/);
    assert.deepEqual([providerCalls, reserveCalls], before, "no AI/quota use when review state is unavailable");
  } finally {
    listener.closeAllConnections();
    await new Promise(resolve => listener.close(resolve));
  }
});
