import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import express from "express";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".budget-test-"));
const { Pool } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = `budget_${randomUUID().replaceAll("-", "")}`;
let first, second;
after(async () => {
  try { await first?.close(); } finally {
    try { await second?.close(); } finally {
      try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally {
        await admin.end();
        await rm(temp, { recursive: true, force: true });
      }
    }
  }
});
await admin.query(`CREATE SCHEMA "${schema}"`);
const bootstrap = await admin.connect();
try {
  await bootstrap.query(`SET search_path TO "${schema}"`);
  const migration = await readFile(new URL("../../../lib/db/migrations/ai-budget.sql", import.meta.url), "utf8");
  await bootstrap.query(migration);
  await bootstrap.query(migration);
  for (const table of ["sbu_profiles", "sbu_cases", "sbu_documents", "sbu_document_analyses"]) {
    await bootstrap.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  }
  await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/consultations.sql", import.meta.url), "utf8"));
} finally { await bootstrap.query("RESET search_path"); bootstrap.release(); }
first = await createRestrictedRoutePool(admin, schema);
second = await createRestrictedRoutePool(admin, schema);
globalThis.__budgetPool = first.pool;
await build({
  stdin: {
    contents: `
      export * from "../src/lib/ai-budget";
      export * from "../src/lib/ai-budget-policy";
      export * from "../src/routes/sbu-chat";
      export * from "../src/routes/consultations";
      export * from "../src/routes/document-analysis";
    `,
    resolveDir: dir, sourcefile: "budget-fixture.ts",
  },
  outfile: join(temp, "fixture.mjs"), bundle: true, platform: "node", format: "esm",
  external: ["express", "drizzle-orm", "drizzle-orm/*", "pdf-lib", "pino", "@workspace/integrations-openai-ai-server"],
  plugins: [{
    name: "restricted-budget-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
      builder.onResolve({ filter: /\/lib\/document-storage$/ }, () => ({ path: "storage", namespace: "fixture" }));
      builder.onResolve({ filter: /\/lib\/document-analysis-pages$/ }, () => ({ path: "pages", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        resolveDir: dir, loader: "js",
        contents: {
          db: `import {drizzle} from "drizzle-orm/node-postgres";
            export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
            export const pool=globalThis.__budgetPool; export const db=drizzle(pool);`,
          auth: `export const getAuth=req=>({userId:req.get("X-Test-Identity")??null});`,
          storage: `export const documentStorage={file:async()=>({
            getMetadata:async()=>[{size:3,contentType:"image/png"}],
            download:async()=>[Buffer.from("png")]
          })};`,
          pages: `export class AnalysisFormatError extends Error {}
            export const MAX_ANALYSIS_BYTES=4*1024*1024;
            export const sourceRevision=()=>"a".repeat(64);
            export const sourcePageCount=async()=>1;
            export const prepareAnalysisPayload=async bytes=>({bytes,pageCount:1});`,
        }[path],
      }));
    },
  }],
});
const { createPostgresAiBudgetStore, parseBudgetPolicy, AiBudgetError,
  createSbuChatRouter, createConsultationsRouter, createDocumentAnalysisRouter } = await import(join(temp, "fixture.mjs"));
// Synthetic prices/capacity only, never used with a real provider.
const pricing = { model: "gpt-5.6-terra", validUntil: "2099-01-01T00:00:00.000Z",
  maxInputTokens: 8192, inputMicrosPerMillion: 1_000_000, outputMicrosPerMillion: 1_000_000 };
const COST = 16_384;
const limits = (globalDay = 10, globalMonth = 100, featureDay = globalDay, featureMonth = globalMonth) =>
  Object.fromEntries(["global", "assistant", "consultation", "document_analysis"].map(scope =>
    [scope, { day: COST * (scope === "global" ? globalDay : featureDay),
      month: COST * (scope === "global" ? globalMonth : featureMonth) }]));
const policy = (caps = limits()) => parseBudgetPolicy(JSON.stringify(pricing), JSON.stringify(caps));
const events = [];
const store = (pool = first.pool, config = policy()) => createPostgresAiBudgetStore(pool, () => config, e => events.push(e));
async function reset() {
  await first.pool.query("DELETE FROM ai_budget_counters");
  events.length = 0;
}
async function counters() {
  return (await first.pool.query("SELECT scope,period,reserved_micros FROM ai_budget_counters ORDER BY scope,period")).rows;
}
const code = expected => error => error instanceof AiBudgetError && error.code === expected;

test("policy has explicit independent defaults and rejects unverified or malformed pricing without echoing config", () => {
  const config = parseBudgetPolicy(JSON.stringify(pricing));
  assert.equal(config.attemptMicros, COST);
  assert.deepEqual(config.limits, {
    global: { day: 10_000_000, month: 100_000_000 },
    assistant: { day: 4_000_000, month: 40_000_000 },
    consultation: { day: 3_000_000, month: 30_000_000 },
    document_analysis: { day: 3_000_000, month: 30_000_000 },
  });
  for (const raw of [undefined, "PRIVATE_SECRET", "{}", "[]",
    ...[
      { model: "unmetered-model" }, { maxInputTokens: 0 }, { maxInputTokens: 1.1 },
      { maxInputTokens: 10_000_001 }, { inputMicrosPerMillion: -1 },
      { outputMicrosPerMillion: Number.MAX_SAFE_INTEGER }, { extra: "PRIVATE_SECRET" },
      { validUntil: "2099-02-31T00:00:00.000Z" },
    ].map(change => JSON.stringify({ ...pricing, ...change }))]) {
    assert.throws(() => parseBudgetPolicy(raw), error => error.message === "AI budget configuration unavailable");
  }
  for (const caps of [{}, { ...limits(), unknown: {} },
    { ...limits(), assistant: { day: -1, month: 10 } },
    { ...limits(), assistant: { day: 20 * COST, month: 100 * COST } },
    { ...limits(), global: { day: 100, month: 99 } }]) {
    assert.throws(() => parseBudgetPolicy(JSON.stringify(pricing), JSON.stringify(caps)));
  }
  assert.equal(parseBudgetPolicy(JSON.stringify({ ...pricing, maxInputTokens: 1, inputMicrosPerMillion: 1,
    outputMicrosPerMillion: 1 })).attemptMicros, 1, "round up, never down");
});

test("two independent pools cannot overspend the shared budget across features and accounts", async () => {
  await reset();
  const config = policy(limits(10, 20));
  const a = store(first.pool, config), b = store(second.pool, config);
  const attempts = await Promise.allSettled(Array.from({ length: 48 }, (_, i) =>
    (i % 2 ? a : b).reserve(["assistant", "consultation", "document_analysis"][i % 3])));
  assert.equal(attempts.filter(a => a.status === "fulfilled").length, 10);
  for (const attempt of attempts.filter(a => a.status === "rejected"))
    assert.ok(code("ai_budget_exhausted")(attempt.reason));
  const rows = await counters();
  assert.equal(rows.find(r => r.scope === "global" && r.period === "day").reserved_micros, String(10 * COST));
  assert.equal(rows.find(r => r.scope === "global" && r.period === "month").reserved_micros, String(10 * COST));
  const featureTotal = rows.filter(r => r.scope !== "global" && r.period === "day")
    .reduce((sum, r) => sum + Number(r.reserved_micros), 0);
  assert.equal(featureTotal, 10 * COST);
  assert.equal(events.filter(e => e.event === "ai_budget_warning" && e.scope === "global" && e.period === "day").length, 1);
  assert.equal(events.filter(e => e.event === "ai_budget_rejected" && e.scope === "global" && e.period === "day").length, 1);
});

test("feature exhaustion does not spend the shared pool or block another feature", async () => {
  await reset();
  const caps = limits(10, 20, 2, 20);
  const budget = store(first.pool, policy(caps));
  await budget.reserve("assistant");
  await budget.reserve("assistant");
  const before = await counters();
  await assert.rejects(budget.reserve("assistant"), code("ai_budget_exhausted"));
  assert.deepEqual(await counters(), before);
  await budget.reserve("consultation");
  await budget.reserve("document_analysis");
  assert.equal((await counters()).find(r => r.scope === "global" && r.period === "day").reserved_micros, String(4 * COST));
});

test("calendar reset uses database UTC day/month; monthly ceilings survive daily resets", async () => {
  await reset();
  const config = policy(limits(2, 3));
  const budget = store(first.pool, config);
  await budget.reserve("assistant");
  await budget.reserve("assistant");
  await assert.rejects(budget.reserve("assistant"), code("ai_budget_exhausted"));
  await first.pool.query("UPDATE ai_budget_counters SET period_start=period_start-interval '1 day' WHERE period='day'");
  await budget.reserve("consultation");
  await assert.rejects(budget.reserve("document_analysis"), code("ai_budget_exhausted"));
  assert.equal((await counters()).find(r => r.scope === "global" && r.period === "month").reserved_micros, String(3 * COST));
  const periods = (await first.pool.query("SELECT DISTINCT period,period_start FROM ai_budget_counters")).rows;
  for (const row of periods) {
    assert.equal(row.period_start.getUTCHours(), 0);
    if (row.period === "month") assert.equal(row.period_start.getUTCDate(), 1);
  }
  await first.pool.query("DELETE FROM ai_budget_counters WHERE period='day'");
  await first.pool.query("UPDATE ai_budget_counters SET period_start=period_start-interval '1 month' WHERE period='month'");
  await budget.reserve("document_analysis");
});

test("mixed policy instances and expired pricing fail closed with no partial charges", async () => {
  await reset();
  await store().reserve("assistant");
  const before = await counters();
  const changed = parseBudgetPolicy(JSON.stringify({ ...pricing, inputMicrosPerMillion: 2_000_000 }), JSON.stringify(limits()));
  await assert.rejects(store(second.pool, changed).reserve("consultation"), code("ai_budget_unavailable"));
  assert.deepEqual(await counters(), before);
  const expired = parseBudgetPolicy(JSON.stringify({ ...pricing, validUntil: "2000-01-01T00:00:00.000Z" }));
  await assert.rejects(store(second.pool, expired).reserve("assistant"), code("ai_budget_unavailable"));
  assert.deepEqual(await counters(), before);
});

test("storage unavailable, missing lock row, transaction failure and ambiguous commit never authorize provider", async () => {
  await reset();
  let providerCalls = 0;
  const privateError = new Error("PRIVATE_PROVIDER_ERROR SECRET chat/document contents");
  const badConnect = { connect: async () => { throw privateError; } };
  for (const step of ["connect", "UPDATE ai_budget_counters", "COMMIT"]) {
    const database = step === "connect" ? badConnect : {
      connect: async () => {
        const client = await first.pool.connect();
        return { release: () => client.release(), query: async (...args) => {
          if (args[0].startsWith(step)) {
            if (step === "COMMIT") await client.query(...args); // Committed but response lost.
            throw privateError;
          }
          return client.query(...args);
        } };
      },
    };
    await assert.rejects(async () => {
      await store(database).reserve("assistant");
      providerCalls++;
    }, code("ai_budget_unavailable"));
  }
  assert.equal(providerCalls, 0);
  // The ambiguous commit is deliberately not refunded.
  assert.equal((await counters()).find(r => r.scope === "global" && r.period === "day").reserved_micros, String(COST));
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE|SECRET|chat\/document|error":/);
  assert.ok(events.every(e => Object.keys(e).every(k => ["event", "scope", "period", "reservedMicros", "limitMicros"].includes(k))));
  await first.pool.query("DELETE FROM ai_budget_lock");
  try { await assert.rejects(store().reserve("assistant"), code("ai_budget_unavailable")); }
  finally { await first.pool.query("INSERT INTO ai_budget_lock(id) VALUES (1)"); }
});

test("failure after an intermediate counter update rolls back every scope", async () => {
  await reset();
  const database = { connect: async () => {
    const client = await first.pool.connect();
    let updates = 0;
    return { release: () => client.release(), query: async (...args) => {
      if (args[0].startsWith("UPDATE ai_budget_counters") && ++updates === 2) throw Error("private failure");
      return client.query(...args);
    } };
  } };
  await assert.rejects(store(database).reserve("assistant"), code("ai_budget_unavailable"));
  assert.deepEqual(await counters(), []);
});

test("all three real routes block before provider on exhaustion or storage outage; read-only operations still work", async () => {
  await reset();
  const caseId = 9001, consultationId = randomUUID(), documentId = randomUUID();
  await first.pool.query("INSERT INTO sbu_profiles(user_id) VALUES ('budget-owner')");
  await first.pool.query(`INSERT INTO sbu_cases(id,owner_id,company_name,request_type,qualification,classification)
    VALUES ($1,'budget-owner','Synthetic','baru','kecil','BG001')`, [caseId]);
  await first.pool.query(`INSERT INTO sbu_consultations(id,owner_id,title,mode,specialist)
    VALUES ($1,'budget-owner','Synthetic','bujk','panduansbu')`, [consultationId]);
  await first.pool.query(`INSERT INTO sbu_documents(id,case_id,owner_id,name,content_type,size,object_path,status,scan_status,scan_generation)
    VALUES ($1,$2,'budget-owner','Synthetic','image/png',3,'synthetic/path','ready','clean','1')`, [documentId, caseId]);
  let providerCalls = 0, calls = [];
  const config = policy(limits(1, 1));
  const real = store(first.pool, config);
  await real.reserve("assistant"); // Entire shared pool now exhausted.
  let reserve = real.reserve;
  const check = async feature => { calls.push(feature); await reserve(feature); };
  const provider = async () => { providerCalls++; throw Error("provider must not run"); };
  const quota = { userId: "budget-owner", dailyLimit: 30, dailyRemaining: 29,
    dailyResetAt: new Date("2099-01-01"), minuteLimit: 6, minuteRemaining: 5,
    minuteResetAt: new Date("2099-01-01"), busy: false, retryAfterSeconds: 0 };
  const app = express();
  app.use(express.json());
  app.use(createSbuChatRouter(provider, {
    reserve: async () => ({ leaseId: randomUUID(), quota }), read: async () => quota, finish: async () => quota,
  }, { active: async () => [] }, check));
  app.use(createConsultationsRouter(provider, check));
  app.use(createDocumentAnalysisRouter(provider, check));
  const listener = app.listen(0, "127.0.0.1");
  await new Promise(resolve => listener.once("listening", resolve));
  const send = (path, body) => fetch(`http://127.0.0.1:${listener.address().port}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Test-Identity": "budget-owner", "X-SBU-Form-Owner": "budget-owner" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const requests = [
    ["/openai/sbu/messages", { mode: "bujk", specialist: "panduansbu", consent: true,
      messages: [{ role: "user", content: "private question" }] }],
    [`/consultations/${consultationId}/messages`, { content: "private question", consent: true, revision: 0, requestId: randomUUID() }],
    [`/cases/${caseId}/documents/${documentId}/analyses`, { focus: "keuangan", consent: true, pages: [1], sourceRevision: "a".repeat(64) }],
  ];
  try {
    for (const outage of [false, true]) {
      calls = [];
      if (outage) reserve = store({ connect: async () => { throw Error("SECRET provider payload"); } }).reserve;
      for (const [path, body] of requests) {
        const response = await send(path, body);
        const json = await response.json();
        assert.equal(response.status, 503, JSON.stringify(json));
        assert.equal(json.code, outage ? "ai_budget_unavailable" : "ai_budget_exhausted");
        assert.doesNotMatch(JSON.stringify(json), /private question|SECRET|payload/);
      }
      assert.deepEqual(calls, ["assistant", "consultation", "document_analysis"]);
    }
    assert.equal(providerCalls, 0);
    assert.deepEqual((await first.pool.query("SELECT messages,revision FROM sbu_consultations")).rows, [{ messages: [], revision: 0 }]);
    assert.equal((await first.pool.query("SELECT count(*)::int AS count FROM sbu_document_analyses")).rows[0].count, 0);
    assert.equal((await send("/consultations")).status, 200);
    assert.equal((await send(`/cases/${caseId}/documents/${documentId}/analyses`)).status, 200);
    await reset();
    reserve = store().reserve;
    for (const [path, body] of requests) {
      const response = await send(path, body);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, undefined, "provider failure is not presented as a budget refusal");
    }
    assert.equal(providerCalls, 3);
    assert.equal((await counters()).find(r => r.scope === "global" && r.period === "day").reserved_micros, String(3 * COST),
      "provider failures in all three features keep full reservations");
    assert.deepEqual((await first.pool.query("SELECT messages,revision FROM sbu_consultations")).rows, [{ messages: [], revision: 0 }]);
    assert.equal((await first.pool.query("SELECT count(*)::int AS count FROM sbu_document_analyses")).rows[0].count, 0);
  } finally {
    listener.closeAllConnections();
    await new Promise(resolve => listener.close(resolve));
  }
});
