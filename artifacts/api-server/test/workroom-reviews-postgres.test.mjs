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
test("Internal decisions preserve chosen snapshots, reject stale/concurrent writes and remain private without mutating sources", async () => {
  const temp = await mkdtemp(join(dir, ".reviews-test-"));
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `reviews_${randomUUID().replaceAll("-", "")}`;
  const bootstrap = await admin.connect();
  let restricted, server, blocker, primaryError;
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(`SET search_path TO "${schema}"`);
    await bootstrap.query(`
      CREATE TABLE sbu_profiles (user_id text PRIMARY KEY);
      CREATE TABLE sbu_cases (
        id integer PRIMARY KEY, owner_id text NOT NULL, client_id integer,
        company_name text NOT NULL, request_type text NOT NULL, qualification text NOT NULL,
        classification text NOT NULL, status text NOT NULL, existing_sbu_expires_on date,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE sbu_evidence (id integer PRIMARY KEY, case_id integer NOT NULL, code text NOT NULL,
        title text NOT NULL, note text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE sbu_documents (id uuid PRIMARY KEY, case_id integer NOT NULL, owner_id text NOT NULL,
        name text NOT NULL, category text NOT NULL, description text NOT NULL, version integer NOT NULL,
        content_type text NOT NULL, size integer NOT NULL, status text NOT NULL, scan_status text NOT NULL,
        object_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO sbu_profiles VALUES ('owner-a'), ('owner-b');
      INSERT INTO sbu_cases (id,owner_id,company_name,request_type,qualification,classification,status,existing_sbu_expires_on)
        VALUES (101,'owner-a','Fixture A','baru','Kecil','Gedung','draf','2028-02-29'),
          (102,'owner-b','Fixture B','baru','Kecil','Gedung','draf',NULL),
          (103,'owner-a','Fixture C','baru','Kecil','Gedung','draf',NULL);
      INSERT INTO sbu_evidence VALUES (1,101,'keuangan','Evidence A','Original evidence',now()),
        (2,102,'keuangan','Evidence B','Other owner',now());
    `);
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/workroom.sql", import.meta.url), "utf8"));
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/workroom-reviews.sql", import.meta.url), "utf8"));
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__reviewsPool = restricted.pool;
    const itemId = randomUUID(), docId = randomUUID(), badDocId = randomUUID();
    await restricted.pool.query("INSERT INTO sbu_workroom_items (id,case_id,owner_id,kind,title,body) VALUES ($1,101,'owner-a','checklist','Review fixture','Original body')", [itemId]);
    await restricted.pool.query(`INSERT INTO sbu_documents VALUES
      ($1,101,'owner-a','Selected.pdf','lainnya','Original metadata',1,'application/pdf',100,'ready','clean','private-fixture-path',now()),
      ($2,102,'owner-b','Other.pdf','lainnya','Other owner',1,'application/pdf',100,'ready','clean','other-fixture-path',now())`, [docId, badDocId]);
    await build({
      entryPoints: [join(dir, "../src/routes/workroom-reviews.ts")], outfile: join(temp, "route.mjs"),
      bundle: true, platform: "node", format: "esm", external: ["express", "drizzle-orm", "drizzle-orm/*"],
      plugins: [{ name: "isolated-reviews", setup(builder) {
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          resolveDir: dir, contents: path === "db" ? `
            import { drizzle } from "drizzle-orm/node-postgres";
            export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
            export const db = drizzle(globalThis.__reviewsPool);
          ` : `export const getAuth = req => ({userId:req.get("x-test-user") ?? null});`,
        }));
      }}],
    });
    const { createWorkroomReviewsRouter } = await import(join(temp, "route.mjs"));
    const app = express(); app.use(express.json()); app.use("/api", createWorkroomReviewsRouter());
    app.use((error, _req, res, _next) => { console.error("Isolated review error:", error.message); res.status(500).json({ error: "test error" }); });
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = "/cases/101/workroom/reviews";
    const call = async (user, path = base, method = "GET", data, formOwner = user) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}),
          ...(formOwner ? { "x-sbu-form-owner": formOwner } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return [response.status, response.headers.get("content-type")?.includes("json") ? await response.json() : null, response.headers];
    };
    const selection = { workroomIds: [itemId], evidenceIds: [1], documentIds: [docId] };
    const preview = async (sel = selection) => {
      const [status, data] = await call("owner-a", `${base}/preview`, "POST", sel);
      assert.equal(status, 200); return data;
    };
    const decision = p => ({
      selection: p.selection, snapshotHash: p.snapshotHash, latestReviewId: p.latestReviewId,
      decision: "approved", note: "Human review fixture", confirmed: true,
    });
    const sources = async () => {
      const result = {};
      for (const table of ["sbu_cases", "sbu_evidence", "sbu_documents", "sbu_workroom_items"])
        result[table] = (await restricted.pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
      return result;
    };
    const original = await sources();
    for (const [method, path, body] of [["GET", base], ["POST", `${base}/preview`, selection], ["POST", base, {}]]) {
      assert.equal((await call(null, path, method, body))[0], 401);
      assert.equal((await call("owner-a", path, method, body, "owner-b"))[0], 409);
      assert.equal((await call("owner-a", path, method, body, null))[0], 409);
    }
    assert.equal((await call("owner-b"))[0], 404);
    assert.equal((await call("owner-b", `${base}/preview`, "POST", selection))[0], 404);
    assert.equal((await call("owner-a", `${base}/preview`, "POST", { ...selection, evidenceIds: [2] }))[0], 404);
    assert.equal((await call("owner-a", `${base}/preview`, "POST", { ...selection, documentIds: [badDocId] }))[0], 404);
    assert.equal((await call("owner-a", `${base}/preview`, "POST", { workroomIds: [], evidenceIds: [], documentIds: [] }))[0], 400);
    assert.equal((await call("owner-a", `${base}/preview`, "POST", { ...selection, workroomIds: [itemId, itemId] }))[0], 400);
    const first = await preview();
    assert.equal(first.snapshot.case.existingSbuExpiresOn, "2028-02-29");
    assert.equal(first.latestReviewId, null);
    assert.equal((await preview()).snapshotHash, first.snapshotHash);
    assert.ok(!JSON.stringify(first).includes("private-fixture-path"));
    assert.ok(!JSON.stringify(first).includes("ownerId"));
    assert.equal((await call("owner-a", base, "POST", { ...decision(first), confirmed: false }))[0], 400);
    assert.equal((await call("owner-a", base, "POST", { ...decision(first), note: "\uFE0F" }))[0], 400);
    assert.equal((await call("owner-b", base, "POST", decision(first)))[0], 404);
    assert.equal((await call("owner-a", "/cases/103/workroom/reviews", "POST", decision(first)))[0], 404);
    const recorded = await call("owner-a", base, "POST", { ...decision(first), ownerId: "owner-b" });
    assert.equal(recorded[0], 201); assert.equal(recorded[1].sequenceNo, 1);
    assert.equal(recorded[2].get("cache-control"), "private, no-store");
    assert.deepEqual(recorded[1].snapshot, first.snapshot);
    assert.deepEqual(await sources(), original);
    assert.equal((await call("owner-a", base, "POST", decision(first)))[0], 409);
    assert.equal((await call("owner-a", `${base}/${recorded[1].id}`, "PATCH", { note: "Overwrite" }))[0], 404);
    assert.equal((await call("owner-a", `${base}/${recorded[1].id}`, "DELETE"))[0], 404);
    const second = await preview();
    const racing = await Promise.all(["approved", "needs_changes"].map(d =>
      call("owner-a", base, "POST", { ...decision(second), decision: d })));
    assert.deepEqual(racing.map(r => r[0]).sort(), [201, 409]);
    assert.equal(racing.find(r => r[0] === 201)[1].sequenceNo, 2);
    assert.equal((await call("owner-a"))[1].reviews.length, 2);
    const stale = await preview();
    blocker = await restricted.pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("UPDATE sbu_workroom_items SET body='Concurrent changed body', revision=revision+1, updated_at=now() WHERE id=$1", [itemId]);
    const blockedSave = call("owner-a", base, "POST", decision(stale));
    let waited = false;
    for (let i = 0; i < 150; i++) {
      const active = await admin.query("SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%sbu_workroom_items%'");
      if (active.rowCount) { waited = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await blocker.query("COMMIT"); blocker.release(); blocker = null;
    assert.equal((await blockedSave)[0], 409);
    assert.ok(waited, "The decision must actually wait for the concurrent material write");
    const afterEdit = (await call("owner-a"))[1];
    assert.equal(afterEdit.reviews.length, 2);
    assert.ok(afterEdit.reviews.every(r => !r.current));
    assert.equal(afterEdit.reviews[1].snapshot.workroomItems[0].body, "Original body");
    assert.equal(afterEdit.materials.workroomItems[0].body, "Concurrent changed body");
    const changed = await preview();
    const third = await call("owner-a", base, "POST", { ...decision(changed), decision: "needs_changes" });
    assert.equal(third[0], 201);
    assert.equal((await call("owner-a"))[1].reviews[0].current, true);
    await restricted.pool.query("UPDATE sbu_evidence SET note='Changed evidence',updated_at=now() WHERE id=1");
    assert.equal((await call("owner-a"))[1].reviews[0].current, false);
    const refreshed = await preview();
    await call("owner-a", base, "POST", decision(refreshed));
    await restricted.pool.query("UPDATE sbu_documents SET description='Changed metadata' WHERE id=$1", [docId]);
    assert.equal((await call("owner-a"))[1].reviews[0].current, false);
    const docPreview = await preview();
    await call("owner-a", base, "POST", decision(docPreview));
    await restricted.pool.query("UPDATE sbu_documents SET scan_status='blocked' WHERE id=$1", [docId]);
    assert.equal((await call("owner-a"))[1].reviews[0].current, false);
    assert.equal((await call("owner-a", `${base}/preview`, "POST", selection))[0], 404);
    await restricted.pool.query("DELETE FROM sbu_workroom_items WHERE id=$1", [itemId]);
    const missing = (await call("owner-a"))[1];
    assert.ok(missing.reviews.every(r => !r.current));
    assert.equal(missing.reviews[0].snapshot.workroomItems[0].id, itemId);
    assert.equal((await call("owner-b"))[0], 404);
    assert.equal((await restricted.pool.query("SELECT DISTINCT owner_id FROM sbu_workroom_reviews")).rows[0].owner_id, "owner-a");
  } catch (error) { primaryError = error; throw error; }
  finally {
    const errors = [];
    for (const cleanup of [
      async () => { if (blocker) { await blocker.query("ROLLBACK"); blocker.release(); } },
      async () => { if (server) await new Promise(resolve => server.close(resolve)); },
      async () => { if (restricted) await restricted.close(); },
      async () => { await bootstrap.query("RESET search_path"); await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); },
      async () => { bootstrap.release(); await admin.end(); },
      async () => { delete globalThis.__reviewsPool; await rm(temp, { recursive: true, force: true }); },
    ]) try { await cleanup(); } catch (error) { errors.push(error); }
    if (errors.length && !primaryError) throw new AggregateError(errors, "Review fixture cleanup failed.");
    if (errors.length && primaryError) console.error("Review cleanup also failed; primary error retained.");
  }
});
