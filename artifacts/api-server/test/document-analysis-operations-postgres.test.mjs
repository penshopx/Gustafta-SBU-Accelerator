import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { once } from "node:events";
import express from "express";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".analysis-operations-"));
const { Pool } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = `analysis_ops_${randomUUID().replaceAll("-", "")}`;
let first, second;
let createDocumentOperationStore, createDocumentAnalysisRouter, DocumentOperationError, a, b;
const f = globalThis.__analysisOperationsFixture = { reads: 0, renders: 0, budgets: 0 };
const result = { summary: "Synthetic draft", extracted: [], concerns: [], missingInformation: [], nextSteps: [] };
const docs = [randomUUID(), randomUUID()];
const servers = [];
after(async () => {
  try {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  } finally {
    try { await first?.close(); } finally {
      try { await second?.close(); } finally {
        try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally {
          await admin.end();
          await rm(temp, { recursive: true, force: true });
          delete globalThis.__analysisOperationsFixture;
        }
      }
    }
  }
});
// Setup runs inside the test lifecycle so a failed build/import still cleans up
// both restricted logins and the disposable schema.
before(async () => {
await admin.query(`CREATE SCHEMA "${schema}"`);
const bootstrap = await admin.connect();
try {
  await bootstrap.query(`SET search_path TO "${schema}"`);
  const migration = await readFile(new URL("../../../lib/db/migrations/document-analysis-operations.sql", import.meta.url), "utf8");
  await bootstrap.query(migration);
  await bootstrap.query(migration); // Startup/post-merge is idempotent.
  for (const table of ["sbu_profiles", "sbu_cases", "sbu_documents", "sbu_document_analyses"]) {
    await bootstrap.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  }
} finally { await bootstrap.query("RESET search_path"); bootstrap.release(); }
first = await createRestrictedRoutePool(admin, schema);
second = await createRestrictedRoutePool(admin, schema);
f.pool = first.pool;
await build({
  stdin: {
    contents: `export * from "../src/lib/document-analysis-operations";
      export * from "../src/routes/document-analysis";`,
    resolveDir: dir, sourcefile: "analysis-operations-fixture.ts",
  },
  outfile: join(temp, "fixture.mjs"), bundle: true, platform: "node", format: "esm",
  external: ["express", "drizzle-orm", "drizzle-orm/*", "pdf-lib", "pino"],
  plugins: [{
    name: "isolated-analysis-operations",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
      builder.onResolve({ filter: /\/lib\/(document-storage|document-analysis-pages|logger)$/ },
        args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        resolveDir: dir, loader: "js",
        contents: {
          db: `import {drizzle} from "drizzle-orm/node-postgres";
            export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
            export const pool=globalThis.__analysisOperationsFixture.pool; export const db=drizzle(pool);`,
          auth: `export const getAuth=req=>({userId:req.get("X-Test-Identity")??null});`,
          logger: `export const logger={warn(){},error(){},info(){}};`,
          "document-storage": `const f=()=>globalThis.__analysisOperationsFixture;
            export const documentStorage={file:async()=>{f().reads++;await f().readGate?.();return {
              getMetadata:async()=>[{size:3,contentType:"image/png"}],
              download:async()=>[Buffer.from("png")]
            }}};`,
          "document-analysis-pages": `export class AnalysisFormatError extends Error {}
            export const MAX_ANALYSIS_BYTES=4*1024*1024;
            export const sourceRevision=()=>"a".repeat(64);
            export const sourcePageCount=async()=>1;
            export const prepareAnalysisPayload=async bytes=>{
              globalThis.__analysisOperationsFixture.renders++;
              return {bytes,pageCount:1,images:[]};
            };`,
        }[path],
      }));
    },
  }],
});
({ createDocumentOperationStore, createDocumentAnalysisRouter, DocumentOperationError } =
  await import(join(temp, "fixture.mjs")));
a = createDocumentOperationStore(first.pool); b = createDocumentOperationStore(second.pool);
await first.pool.query("INSERT INTO sbu_profiles(user_id) VALUES ('owner-a'),('owner-b')");
await first.pool.query(`INSERT INTO sbu_cases(id,owner_id,company_name,request_type,qualification,classification)
  VALUES (1,'owner-a','Synthetic A','baru','kecil','BG001'),(2,'owner-b','Synthetic B','baru','kecil','BG001')`);
for (const [i, id] of docs.entries()) {
  await first.pool.query(`INSERT INTO sbu_documents(id,case_id,owner_id,name,content_type,size,object_path,status,
    scan_status,scan_generation,category,description,version) VALUES ($1,$2,$3,'fixture','image/png',3,
    'private/synthetic','ready','clean','1','lainnya','',1)`, [id, i + 1, `owner-${i ? "b" : "a"}`]);
}
});
const limited = error => error instanceof DocumentOperationError && error.status === 429;
const unavailable = error => error instanceof DocumentOperationError && error.status === 503;
async function reset() {
  await first.pool.query("DELETE FROM sbu_document_analysis_operations");
  await first.pool.query("DELETE FROM sbu_document_analyses");
  Object.assign(f, { reads: 0, renders: 0, budgets: 0, readGate: undefined });
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function listen(store, generate = async () => result, timeout) {
  const app = express(); app.use(express.json());
  app.use(createDocumentAnalysisRouter(generate, async () => { f.budgets++; }, store, timeout));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise(resolve => server.once("listening", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function call(base, { owner = "owner-a", identity = owner, header = identity,
  kind = "analyses", signal, documentId = docs[owner === "owner-b" ? 1 : 0] } = {}) {
  const index = owner === "owner-b" ? 1 : 0;
  const response = await fetch(`${base}/cases/${index + 1}/documents/${documentId}/${kind}`, {
    method: kind === "analysis-source" ? "GET" : "POST", signal,
    headers: { "Content-Type": "application/json", ...(identity ? { "X-Test-Identity": identity } : {}),
      ...(header ? { "X-SBU-Form-Owner": header } : {}) },
    ...(kind === "analysis-source" ? {} : { body: JSON.stringify({
      ...(kind === "analyses" ? { consent: true, focus: "keuangan" } : {}),
      pages: [1], sourceRevision: "a".repeat(64),
    }) }),
  });
  return { status: response.status, body: await response.json(), retry: response.headers.get("Retry-After") };
}
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for synthetic operation");
}
async function lease(owner = "owner-a") {
  return (await first.pool.query("SELECT * FROM sbu_document_analysis_operations WHERE owner_id=$1", [owner])).rows[0];
}

test("two database pools serialize reservation, preserve three attempts on restart and reset using database time", async () => {
  await reset();
  const reservations = await Promise.allSettled(Array.from({ length: 24 }, (_, i) =>
    (i % 2 ? a : b).reserve("owner-a", "analysis")));
  assert.equal(reservations.filter(r => r.status === "fulfilled").length, 1);
  assert.ok(reservations.filter(r => r.status === "rejected").every(r => limited(r.reason)));
  assert.equal((await lease()).analysis_count, 1);
  const token = reservations.find(r => r.status === "fulfilled").value;
  await a.release("owner-a", token);
  for (let i = 0; i < 2; i++) {
    const token = await b.reserve("owner-a", "analysis");
    await b.release("owner-a", token);
  }
  await assert.rejects(createDocumentOperationStore(second.pool).reserve("owner-a", "analysis"), limited);
  assert.equal((await lease()).analysis_count, 3, "release and rejected requests never refund/charge attempts");
  await first.pool.query("UPDATE sbu_document_analysis_operations SET analysis_since=clock_timestamp()-interval '61 seconds'");
  await a.release("owner-a", await a.reserve("owner-a", "analysis"));
  assert.equal((await lease()).analysis_count, 1);
});

test("leases expire after process loss and stale completion cannot release a replacement or another owner", async () => {
  await reset();
  const old = await a.reserve("owner-a", "analysis");
  const other = await b.reserve("owner-b", "analysis");
  await assert.rejects(createDocumentOperationStore(second.pool).reserve("owner-a", "inspection"), limited);
  const row = await lease();
  assert.ok(row.expires_at - row.analysis_since >= 89_000 && row.expires_at - row.analysis_since <= 91_000);
  await first.pool.query("UPDATE sbu_document_analysis_operations SET expires_at=clock_timestamp()-interval '1 second' WHERE owner_id='owner-a'");
  const replacement = await createDocumentOperationStore(second.pool).reserve("owner-a", "inspection");
  await a.release("owner-a", old);
  await a.release("owner-b", replacement);
  assert.equal((await lease()).token, replacement);
  assert.equal((await lease("owner-b")).token, other);
  await assert.rejects(a.assertCurrent("owner-a", old), unavailable);
  await b.assertCurrent("owner-a", replacement);
  await b.release("owner-a", replacement);
  await b.release("owner-b", other);
  for (let i = 1; i < 12; i++) await a.release("owner-a", await a.reserve("owner-a", "inspection"));
  await assert.rejects(b.reserve("owner-a", "inspection"), limited);
  await b.release("owner-a", await b.reserve("owner-a", "analysis"));
  assert.equal((await lease()).inspection_count, 12, "inspection and paid rate counters remain separate");
});

test("killed worker leaves a shared lease; replacement process waits for expiry without losing attempts", { timeout: 15_000 }, async () => {
  await reset();
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import {createRequire} from "node:module";
    process.once("message", async config => {
      const {Pool}=createRequire(config.dbPackage)("pg");
      const pool=new Pool(config.database);
      globalThis.__analysisOperationsFixture={pool};
      const {createDocumentOperationStore}=await import(config.fixture);
      const token=await createDocumentOperationStore(pool).reserve("owner-a","analysis");
      process.send({token});
      setInterval(()=>{},1000);
    });
  `], { env: { NODE_ENV: "test" }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const exited = once(child, "exit");
  try {
    const ready = once(child, "message");
    child.send({
      dbPackage: fileURLToPath(new URL("../../../lib/db/package.json", import.meta.url)),
      fixture: join(temp, "fixture.mjs"),
      database: { connectionString: first.pool.options.connectionString, options: `-c search_path=${schema}`, max: 2 },
    });
    const [{ token }] = await Promise.race([ready, exited.then(() => { throw Error("Synthetic worker exited before reservation"); })]);
    child.kill("SIGKILL");
    await exited;
    const restarted = createDocumentOperationStore(second.pool);
    await assert.rejects(restarted.reserve("owner-a", "analysis"), limited);
    assert.equal((await lease()).token, token);
    await first.pool.query("UPDATE sbu_document_analysis_operations SET expires_at=clock_timestamp()-interval '1 second'");
    const replacement = await restarted.reserve("owner-a", "analysis");
    assert.equal((await lease()).analysis_count, 2, "crash does not refund the original attempt");
    await a.release("owner-a", token);
    assert.equal((await lease()).token, replacement);
    await restarted.release("owner-a", replacement);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  }
});

test("database failures fail closed, rollback partial reservation and retain ambiguous commit until expiry", async () => {
  await reset();
  for (const failure of ["connect", "UPDATE sbu_document_analysis_operations", "COMMIT"]) {
    const store = createDocumentOperationStore({ connect: async () => {
      if (failure === "connect") throw Error("PRIVATE error");
      const client = await first.pool.connect();
      return { release: () => client.release(), query: async (...args) => {
        if (args[0].startsWith(failure)) {
          if (failure === "COMMIT") await client.query(...args);
          throw Error("PRIVATE error");
        }
        return client.query(...args);
      } };
    } });
    await assert.rejects(store.reserve("owner-a", "analysis"), error =>
      unavailable(error) && !error.message.includes("PRIVATE"));
    if (failure !== "COMMIT") assert.equal(await lease(), undefined);
  }
  await assert.rejects(b.reserve("owner-a", "analysis"), limited);
  assert.equal((await lease()).analysis_count, 1);
});

test("two simultaneous routers reject before bytes, isolate owners and share active locks with preview/source", async () => {
  await reset();
  const entered = deferred(), finish = deferred();
  const left = await listen(a, async () => { entered.resolve(); await finish.promise; return result; });
  const right = await listen(b);
  const running = call(left);
  await entered.promise;
  assert.equal(f.reads, 1);
  for (const kind of ["analyses", "analysis-preview", "analysis-source"]) {
    const response = await call(right, { kind });
    assert.equal(response.status, 429, JSON.stringify(response));
    assert.equal(response.retry, "60");
  }
  assert.equal(f.reads, 1, "all active-lock rejections precede storage access and rendering");
  assert.equal((await call(right, { owner: "owner-b" })).status, 201);
  const contender = await second.pool.connect();
  try {
    await contender.query("BEGIN");
    await contender.query("SET LOCAL lock_timeout='100ms'");
    await contender.query("SELECT * FROM sbu_document_analysis_operations WHERE owner_id='owner-a' FOR UPDATE");
    await contender.query("SELECT * FROM sbu_documents WHERE id=$1 FOR UPDATE", [docs[0]]);
    await contender.query("ROLLBACK");
  } finally { contender.release(); }
  finish.resolve();
  assert.equal((await running).status, 201, "no row locks or open transaction held during provider wait");
  const before = f.reads;
  for (const options of [{ identity: null }, { header: "owner-b" }, { identity: "owner-b" }]) {
    assert.ok([401, 409, 404].includes((await call(right, options)).status));
  }
  assert.equal(f.reads, before);
});

test("new router after shutdown preserves rate limit, including failed AI attempts", async () => {
  await reset();
  const left = await listen(a, async () => { throw Error("synthetic provider outage"); });
  const right = await listen(b, async () => { throw Error("synthetic provider outage"); });
  for (const base of [left, right, left]) assert.equal((await call(base)).status, 503);
  const server = servers.find(s => left.endsWith(`:${s.address()?.port}`));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  servers.splice(servers.indexOf(server), 1);
  const restarted = await listen(createDocumentOperationStore(second.pool));
  assert.equal((await call(restarted)).status, 429);
  assert.equal(f.reads, 3);
  assert.equal(f.budgets, 3);
  assert.equal((await lease()).analysis_count, 3);
});

test("disconnect releases lease, consumes attempt and prevents late provider result from saving or clearing successor", async () => {
  await reset();
  const entered = deferred(), finish = deferred(), nextEntered = deferred(), nextFinish = deferred();
  const left = await listen(a, async () => { entered.resolve(); await finish.promise; return result; });
  const right = await listen(b, async () => { nextEntered.resolve(); await nextFinish.promise; return result; });
  const abort = new AbortController();
  const running = call(left, { signal: abort.signal });
  await entered.promise;
  abort.abort();
  await assert.rejects(running);
  await waitFor(async () => (await lease())?.token === null);
  const next = call(right);
  await nextEntered.promise;
  const nextToken = (await lease()).token;
  finish.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await lease()).token, nextToken);
  assert.equal((await first.pool.query("SELECT count(*)::int AS count FROM sbu_document_analyses")).rows[0].count, 0);
  nextFinish.resolve();
  assert.equal((await next).status, 201);
  assert.equal((await lease()).analysis_count, 2);
});

test("timeout while storage stalls releases lock and prevents late rendering, budget or AI calls", async () => {
  await reset();
  const entered = deferred(), finish = deferred();
  f.readGate = async () => { entered.resolve(); await finish.promise; };
  let calls = 0;
  const left = await listen(a, async () => { calls++; return result; }, 80);
  const right = await listen(b);
  const running = call(left);
  await entered.promise;
  assert.equal((await running).status, 503);
  await waitFor(async () => (await lease())?.token === null);
  assert.equal((await lease()).analysis_count, 1);
  f.readGate = undefined;
  assert.equal((await call(right)).status, 201);
  finish.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
  assert.equal(f.renders, 1, "only successor renders");
  assert.equal(f.budgets, 1, "only successor reserves paid budget");
});

test("provider that ignores timeout cannot save a late result or remove the next operation", async () => {
  await reset();
  const entered = deferred(), finish = deferred();
  const nextEntered = deferred(), nextFinish = deferred();
  let cancelledSignal;
  const left = await listen(a, async (_bytes, _type, _input, signal) => {
    cancelledSignal = signal; entered.resolve(); await finish.promise; return result;
  }, 100);
  const right = await listen(b, async () => { nextEntered.resolve(); await nextFinish.promise; return result; });
  const running = call(left);
  await entered.promise;
  assert.equal((await running).status, 503);
  assert.equal(cancelledSignal.aborted, true);
  await waitFor(async () => (await lease())?.token === null);
  const next = call(right);
  await nextEntered.promise;
  const nextToken = (await lease()).token;
  finish.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await lease()).token, nextToken);
  assert.equal((await first.pool.query("SELECT count(*)::int AS count FROM sbu_document_analyses")).rows[0].count, 0);
  nextFinish.resolve();
  assert.equal((await next).status, 201);
  assert.equal((await lease()).analysis_count, 2);
});

test("expired worker is fenced from archiving and reservation outage never reads source bytes", async () => {
  await reset();
  const entered = deferred(), finish = deferred();
  const left = await listen(a, async () => { entered.resolve(); await finish.promise; return result; });
  const running = call(left);
  await entered.promise;
  await first.pool.query("UPDATE sbu_document_analysis_operations SET expires_at=clock_timestamp()-interval '1 second'");
  const replacement = await b.reserve("owner-a", "analysis");
  finish.resolve();
  assert.equal((await running).status, 409);
  assert.equal((await lease()).token, replacement);
  assert.equal((await first.pool.query("SELECT count(*)::int AS count FROM sbu_document_analyses")).rows[0].count, 0);
  const before = f.reads;
  const unavailableStore = createDocumentOperationStore({ connect: async () => { throw Error("PRIVATE"); } });
  const outage = await listen(unavailableStore);
  for (const kind of ["analyses", "analysis-preview", "analysis-source"]) {
    const response = await call(outage, { kind });
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE/);
  }
  assert.equal(f.reads, before);
  await b.release("owner-a", replacement);
});
