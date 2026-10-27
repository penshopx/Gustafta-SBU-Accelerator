import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import express from "express";
import { build } from "esbuild";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const { Pool } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");

test("SMAP checklist isolated append-only lifecycle", async t => {
  const temp = await mkdtemp(join(dir, ".smap-test-"));
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `smap_${randomUUID().replaceAll("-", "")}`;
  const bootstrap = await admin.connect();
  let restricted, server, primaryError;
  const docId = randomUUID(), alienDoc = randomUUID(), ownOtherCase = randomUUID(), pendingDoc = randomUUID(), infectedDoc = randomUUID(), series = randomUUID();
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(`SET search_path TO "${schema}"`);
    await bootstrap.query(`
      CREATE TABLE sbu_profiles (user_id text PRIMARY KEY);
      CREATE TABLE sbu_cases (id integer PRIMARY KEY, owner_id text NOT NULL, status text NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE sbu_evidence (id integer PRIMARY KEY, case_id integer NOT NULL, notes text NOT NULL);
      CREATE TABLE sbu_documents (
        id uuid PRIMARY KEY, case_id integer NOT NULL, owner_id text NOT NULL,
        name text NOT NULL, content_type text NOT NULL DEFAULT 'application/pdf', size integer NOT NULL DEFAULT 100,
        object_path text NOT NULL DEFAULT 'synthetic/no-storage', status text NOT NULL DEFAULT 'ready',
        scan_status text NOT NULL DEFAULT 'clean', scan_generation text, scanned_at timestamptz,
        category text NOT NULL DEFAULT 'smap', description text NOT NULL DEFAULT '',
        series_id uuid, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO sbu_profiles VALUES ('owner-a'),('owner-b');
      INSERT INTO sbu_cases VALUES (101,'owner-a','draf','2026-01-01'), (102,'owner-b','draf','2026-01-02'), (103,'owner-a','draf','2026-01-03');
      INSERT INTO sbu_evidence VALUES (1,101,'Unchanged fixture');
    `);
    for (const [id, caseId, owner, status, scanStatus, sid] of [
      [docId, 101, "owner-a", "ready", "clean", series],
      [alienDoc, 102, "owner-b", "ready", "clean", null],
      [ownOtherCase, 103, "owner-a", "ready", "clean", null],
      [pendingDoc, 101, "owner-a", "pending", "pending", null],
      [infectedDoc, 101, "owner-a", "ready", "infected", null],
    ]) await bootstrap.query(`INSERT INTO sbu_documents(id,case_id,owner_id,name,status,scan_status,series_id)
      VALUES($1,$2,$3,'Synthetic policy',$4,$5,$6)`, [id, caseId, owner, status, scanStatus, sid]);
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/smap-checklist.sql", import.meta.url), "utf8"));
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__smapPool = restricted.pool;
    await build({
      entryPoints: [join(dir, "../src/routes/smap-checklist.ts")], outfile: join(temp, "route.mjs"),
      bundle: true, platform: "node", format: "esm", external: ["express", "drizzle-orm", "drizzle-orm/*"],
      plugins: [{ name: "isolated-smap", setup(builder) {
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          resolveDir: dir, contents: path === "db" ? `
            import { drizzle } from "drizzle-orm/node-postgres";
            export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
            export const db = drizzle(globalThis.__smapPool);
          ` : `export const getAuth = req => ({userId:req.get("x-test-user") ?? null});`,
        }));
      }}],
    });
    const { createSmapChecklistRouter } = await import(join(temp, "route.mjs"));
    const app = express(); app.use(express.json());
    app.use("/api", createSmapChecklistRouter());
    app.use((error, _req, res, _next) => { res.status(500).json({ error: "Fixture route failed" }); });
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}/api`;
    const base = "/cases/101/smap-checklist", path = `${base}/SMC-I-01`;
    const call = async (url = base, method = "GET", body, user = "owner-a", formOwner = user) => {
      const r = await fetch(origin + url, { method, headers: {
        ...(user ? { "x-test-user": user } : {}), ...(formOwner ? { "X-SBU-Form-Owner": formOwner } : {}),
        "Content-Type": "application/json",
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error" });
      return { status: r.status, body: await r.json(), cache: r.headers.get("cache-control") };
    };
    const originalCases = (await restricted.pool.query("SELECT * FROM sbu_cases ORDER BY id")).rows;
    const originalEvidence = (await restricted.pool.query("SELECT * FROM sbu_evidence ORDER BY id")).rows;
    let document, saved;
    await t.test("23 local questions, no score, no private storage paths; pending/infected excluded", async () => {
      const r = await call(); assert.equal(r.status, 200); assert.equal(r.cache, "private, no-store");
      assert.equal(r.body.questions.length, 23); assert.equal(new Set(r.body.questions.map(q => q.id)).size, 23);
      assert.deepEqual(r.body.entries, []); assert.equal(r.body.documents.length, 1);
      document = r.body.documents[0]; assert.equal(document.id, docId);
      assert.equal(JSON.stringify(r.body).includes("synthetic/no-storage"), false);
      assert.equal(r.body.score, undefined);
    });
    const payload = (revision = 0) => ({ revision, answer: "ada", notes: "Synthetic working note", evidence: [{ id: document.id, fingerprint: document.fingerprint }] });
    await t.test("all endpoints reject no login, forged owner and cross-account case access", async () => {
      for (const [url, method, body] of [
        [base, "GET"], [path, "PUT", payload()], [`${path}/review`, "POST", { revision: 1, status: "adequate", note: "Synthetic review" }],
        [`${path}/history`, "GET"],
      ]) {
        assert.equal((await call(url, method, body, null, "owner-a")).status, 401);
        assert.equal((await call(url, method, body, "owner-a", "owner-b")).status, 409);
        assert.equal((await call(url, method, body, "owner-b")).status, 404);
      }
      assert.equal((await restricted.pool.query("SELECT count(*)::int n FROM sbu_smap_checklist_revisions")).rows[0].n, 0);
    });
    await t.test("reject wrong-case/other-owner/unsafe documents and bad declarations", async () => {
      for (const id of [alienDoc, ownOtherCase, pendingDoc, infectedDoc]) {
        assert.equal((await call(path, "PUT", { ...payload(), evidence: [{ id, fingerprint: document.fingerprint }] })).status, 409);
      }
      for (const body of [
        { ...payload(), notes: "x".repeat(3001) }, { ...payload(), answer: "lulus" },
        { ...payload(), reviewedBy: "forged" }, { ...payload(), evidence: [...payload().evidence, ...payload().evidence] },
      ]) assert.equal((await call(path, "PUT", body)).status, 400);
      assert.equal((await call(`${base}/unknown`, "PUT", payload())).status, 400);
    });
    await t.test("persist declaration, explicit review, and immutable history", async () => {
      const r = await call(path, "PUT", payload()); assert.equal(r.status, 200); saved = r.body;
      assert.equal(saved.revision, 1); assert.equal(saved.reviewStatus, "unreviewed"); assert.equal(saved.reviewedBy, null);
      assert.deepEqual((await call()).body.entries[0], saved);
      const review = await call(`${path}/review`, "POST", { revision: 1, status: "adequate", note: "Evidence checked internally" });
      assert.equal(review.status, 200); assert.equal(review.body.reviewedBy, "owner-a");
      assert.equal(review.body.revision, 2); assert.equal(review.body.reviewStatus, "adequate");
      const history = await call(`${path}/history`); assert.equal(history.body.length, 2);
      assert.equal(history.body[1].reviewStatus, "unreviewed");
      assert.equal((await call(`${path}/review`, "POST", { revision: 2, status: "adequate", note: "  " })).status, 400);
    });
    await t.test("metadata changes invalidate review; stale preview cannot be submitted", async () => {
      await restricted.pool.query("UPDATE sbu_documents SET description='Changed metadata' WHERE id=$1", [docId]);
      const list = await call(); assert.equal(list.body.entries[0].needsReview, true);
      assert.equal(list.body.entries[0].reviewStatus, "adequate");
      assert.equal((await call(`${path}/review`, "POST", { revision: 2, status: "adequate", note: "Stale" })).status, 409);
      assert.equal((await call(path, "PUT", payload(2))).status, 409);
      document = list.body.documents[0];
      const r = await call(path, "PUT", payload(2)); assert.equal(r.status, 200);
      assert.equal(r.body.reviewStatus, "unreviewed"); assert.equal(r.body.revision, 3);
      const old = (await call(`${path}/history`)).body.find(r => r.revision === 2);
      assert.equal(old.reviewNote, "Evidence checked internally"); assert.equal(old.needsReview, true);
    });
    await t.test("two concurrent saves cannot overwrite each other, including first insertion", async () => {
      for (const [url, revision] of [[path, 3], [`${base}/SMC-II-01`, 0]]) {
        const results = await Promise.all(["First", "Second"].map(notes => call(url, "PUT", { ...payload(revision), notes })));
        assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      }
    });
    await t.test("replacement version and deletion require renewed evidence", async () => {
      const replacement = randomUUID();
      await restricted.pool.query(`INSERT INTO sbu_documents(id,case_id,owner_id,name,series_id,version)
        VALUES($1,101,'owner-a','Synthetic policy v2',$2,2)`, [replacement, series]);
      const list = await call(); assert.equal(list.body.entries.find(e => e.questionId === "SMC-I-01").needsReview, true);
      assert.equal(list.body.documents.some(d => d.id === docId), false);
      document = list.body.documents.find(d => d.id === replacement);
      assert.equal((await call(path, "PUT", payload(4))).status, 200);
      assert.equal((await call(`${path}/review`, "POST", { revision: 5, status: "adequate", note: "Review new version" })).status, 200);
      await restricted.pool.query("DELETE FROM sbu_documents WHERE id=$1", [replacement]);
      assert.equal((await call()).body.entries.find(e => e.questionId === "SMC-I-01").needsReview, true);
      const history = (await call(`${path}/history`)).body;
      assert.equal(history[0].evidence[0].name, "Synthetic policy v2");
      assert.equal(history[0].reviewedBy, "owner-a");
      assert.equal((await call(`${path}/review`, "POST", { revision: 6, status: "adequate", note: "Deleted" })).status, 409);
    });
    await t.test("reset creates revision without erasing old decisions; no-evidence adequate review rejected", async () => {
      const r = await call(path, "PUT", { revision: 6, answer: "unanswered", notes: "", evidence: [] });
      assert.equal(r.status, 200); assert.equal(r.body.revision, 7);
      assert.equal(r.body.reviewStatus, "unreviewed");
      assert.equal((await call(`${path}/review`, "POST", { revision: 7, status: "adequate", note: "No evidence" })).status, 400);
      assert.equal((await call(`${path}/history`)).body.length, 7);
      assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_cases ORDER BY id")).rows, originalCases);
      assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_evidence ORDER BY id")).rows, originalEvidence);
      assert.deepEqual((await call("/cases/102/smap-checklist", "GET", undefined, "owner-b")).body.entries, []);
    });
  } catch (error) { primaryError = error; throw error; }
  finally {
    const errors = [];
    for (const cleanup of [
      async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } },
      async () => { if (restricted) await restricted.close(); },
      async () => { await bootstrap.query("RESET search_path"); await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); },
      async () => { bootstrap.release(); await admin.end(); },
      async () => { delete globalThis.__smapPool; await rm(temp, { recursive: true, force: true }); },
    ]) try { await cleanup(); } catch (error) { errors.push(error); }
    if (errors.length && !primaryError) throw new AggregateError(errors, "SMAP fixture cleanup failed.");
    if (errors.length && primaryError) console.error("SMAP fixture cleanup also failed; primary error retained.");
  }
});
