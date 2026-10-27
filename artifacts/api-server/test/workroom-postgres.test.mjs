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
test("Workroom CRUD is case/owner bound, revision safe, calendar preserving and does not mutate assessment inputs", async () => {
  const temp = await mkdtemp(join(dir, ".workroom-test-"));
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `workroom_${randomUUID().replaceAll("-", "")}`;
  const bootstrap = await admin.connect();
  let restricted, server, primaryError;
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(`SET search_path TO "${schema}"`);
    await bootstrap.query(`
      CREATE TABLE sbu_profiles (user_id text PRIMARY KEY);
      CREATE TABLE sbu_cases (id integer PRIMARY KEY, owner_id text NOT NULL, company_name text NOT NULL, classification text NOT NULL, status text NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE sbu_evidence (id integer PRIMARY KEY, case_id integer NOT NULL, notes text NOT NULL);
      INSERT INTO sbu_profiles VALUES ('owner-a'),('owner-b');
      INSERT INTO sbu_cases VALUES (101,'owner-a','Perusahaan A','BG001','draf','2026-01-01'), (102,'owner-b','Perusahaan B','BG002','ditinjau','2026-01-02'), (103,'owner-a','Perusahaan C','BG003','draf','2026-01-03');
      INSERT INTO sbu_evidence VALUES (1,101,'Unchanged fixture');
    `);
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/workroom.sql", import.meta.url), "utf8"));
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/workroom-agenda-index.sql", import.meta.url), "utf8"));
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__workroomPool = restricted.pool;
    await build({
      entryPoints: [join(dir, "../src/routes/workroom.ts")], outfile: join(temp, "route.mjs"),
      bundle: true, platform: "node", format: "esm", external: ["express", "drizzle-orm", "drizzle-orm/*"],
      plugins: [{ name: "isolated-workroom", setup(builder) {
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          resolveDir: dir, contents: path === "db" ? `
            import { drizzle } from "drizzle-orm/node-postgres";
            export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
            export const db = drizzle(globalThis.__workroomPool);
          ` : `export const getAuth = req => ({userId:req.get("x-test-user") ?? null});`,
        }));
      }}],
    });
    const { createWorkroomRouter } = await import(join(temp, "route.mjs"));
    const app = express(); app.use(express.json()); app.use("/api", createWorkroomRouter());
    app.use((error, _req, res, _next) => { console.error("Isolated Workroom error:", error.message); res.status(500).json({ error: "test error" }); });
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const call = async (user, path = "/cases/101/workroom", method = "GET", data, formOwner = user) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}),
          ...(formOwner ? { "x-sbu-form-owner": formOwner } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return [response.status, response.status === 204 ? null : await response.json(), response.headers];
    };
    const base = "/cases/101/workroom";
    assert.equal((await call(null))[0], 401);
    assert.equal((await call("owner-a", base, "GET", undefined, "owner-b"))[0], 409);
    assert.equal((await call("owner-a", base, "GET", undefined, null))[0], 409);
    assert.equal((await call("owner-b"))[0], 404);
    assert.equal((await call("owner-a", "/cases/999/workroom"))[0], 404);
    assert.equal((await call("owner-a", "/cases/NaN/workroom"))[0], 400);
    assert.deepEqual((await call("owner-a"))[1].items, []);
    const originalCases = (await restricted.pool.query("SELECT * FROM sbu_cases ORDER BY id")).rows;
    const originalEvidence = (await restricted.pool.query("SELECT * FROM sbu_evidence ORDER BY id")).rows;
    for (const data of [
      { kind: "action", title: "\u200b" },
      { kind: "checklist", title: "\uFE0F" },
      { kind: "action", title: "Task", dueOn: "2027-02-29" },
      { kind: "journal", title: "Note", status: "done" },
      { kind: "journal", title: "Note", assignee: "Someone" },
    ]) assert.equal((await call("owner-a", base, "POST", data))[0], 400);
    const records = [];
    for (const kind of ["checklist", "action", "journal"]) {
      const result = await call("owner-a", base, "POST", {
        kind, title: ` ${kind} fixture `, body: "Working note",
        ...(kind === "action" ? { assignee: "Fixture assignee", dueOn: "2028-02-29" } : {}),
      });
      assert.equal(result[0], 201); assert.equal(result[2].get("cache-control"), "private, no-store");
      assert.equal(result[1].ownerId, undefined); assert.equal(result[1].title, `${kind} fixture`);
      records.push(result[1]);
    }
    const [checklist, action, journal] = records;
    const agenda = (user, query = "", formOwner = user) =>
      call(user, `/agenda${query}`, "GET", undefined, formOwner);
    assert.equal((await agenda(null))[0], 401);
    assert.equal((await agenda("owner-a", "", null))[0], 409);
    assert.equal((await agenda("owner-a", "", "owner-b"))[0], 409);
    for (const query of ["?page=0", "?pageSize=101", "?filter=invalid", "?search=" + "x".repeat(121), "?ownerId=owner-b"]) {
      assert.equal((await agenda("owner-a", query))[0], 400, query);
    }
    const today = (await agenda("owner-a"))[1].today;
    const day = offset => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const more = [];
    for (const [caseId, user, title, status, dueOn] of [
      [101, "owner-a", "Terlambat %_ literal", "todo", day(-1)],
      [101, "owner-a", "Hari ini", "doing", today],
      [101, "owner-a", "Segera", "todo", day(7)],
      [101, "owner-a", "Tanpa tanggal", "todo", null],
      [101, "owner-a", "Selesai", "done", day(-4)],
      [103, "owner-a", "Kasus lain", "todo", day(2)],
      [102, "owner-b", "Rahasia akun lain", "todo", day(-3)],
    ]) {
      const [statusCode, record] = await call(user, `/cases/${caseId}/workroom`, "POST",
        { kind: "action", title, status, dueOn, body: "Note never in agenda", assignee: "Tim uji" });
      assert.equal(statusCode, 201); more.push({ caseId, user, record });
    }
    const [agendaStatus, pageOne, agendaHeaders] = await agenda("owner-a", "?pageSize=2");
    assert.equal(agendaStatus, 200);
    assert.equal(agendaHeaders.get("cache-control"), "private, no-store");
    assert.equal(pageOne.ownerId, "owner-a");
    assert.equal(pageOne.today, today);
    assert.equal(pageOne.total, 6);
    assert.equal(pageOne.hasNext, true);
    assert.equal(pageOne.items.length, 2);
    assert.equal(pageOne.items[0].title, "Terlambat %_ literal");
    assert.equal(pageOne.items[1].title, "Hari ini");
    assert.equal(pageOne.items[0].body, undefined);
    const all = (await agenda("owner-a", "?filter=all&pageSize=100"))[1];
    assert.equal(all.total, 7); assert.equal(all.hasNext, false);
    assert.equal(all.items.at(-1).title, "Selesai");
    assert.deepEqual(all.items.map(r => r.caseId).filter(id => id === 103), [103]);
    assert.ok(all.items.every(r => r.caseId !== 102 && !r.title.includes("Rahasia")));
    assert.equal((await agenda("owner-a", "?page=2&pageSize=2"))[1].items[0].title, "Kasus lain");
    assert.equal((await agenda("owner-a", "?page=99&pageSize=2"))[1].items.length, 0);
    for (const [filter, countExpected] of [["overdue", 1], ["today", 1], ["week", 3], ["undated", 1], ["done", 1]]) {
      assert.equal((await agenda("owner-a", `?filter=${filter}`))[1].total, countExpected, filter);
    }
    assert.equal((await agenda("owner-a", "?search=%25%5F"))[1].total, 1);
    assert.equal((await agenda("owner-a", "?search=Kasus%20lain"))[1].items[0].caseId, 103);
    assert.equal((await agenda("owner-b", "?filter=all"))[1].total, 1);
    assert.equal((await agenda("owner-b", "?filter=all"))[1].items[0].title, "Rahasia akun lain");
    const [sameTimeA, sameTimeB] = await Promise.all([agenda("owner-a", "?filter=all"), agenda("owner-b", "?filter=all")]);
    assert.equal(sameTimeA[1].total, 7);
    assert.equal(sameTimeB[1].total, 1);
    const inconsistentId = randomUUID();
    await restricted.pool.query(
      `INSERT INTO sbu_workroom_items (id, case_id, owner_id, kind, title, due_on)
       VALUES ($1, 102, 'owner-a', 'action', 'Misassigned fixture', $2)`, [inconsistentId, today]);
    assert.equal((await agenda("owner-a", "?filter=all"))[1].total, 7);
    assert.equal((await agenda("owner-b", "?filter=all"))[1].total, 1);
    await restricted.pool.query("DELETE FROM sbu_workroom_items WHERE id = $1", [inconsistentId]);
    for (const { caseId, user, record } of more) {
      assert.equal((await call(user, `/cases/${caseId}/workroom/${record.id}`, "DELETE", { revision: record.revision }))[0], 204);
    }
    const actionPath = `${base}/${action.id}`;
    for (const [method, data] of [["GET", undefined], ["POST", { kind: "action", title: "X" }]]) {
      assert.equal((await call("owner-b", base, method, data))[0], 404);
    }
    for (const [method, data] of [["PATCH", { revision: 0, title: "Hijack" }], ["DELETE", { revision: 0 }]]) {
      assert.equal((await call("owner-b", actionPath, method, data))[0], 404);
      assert.equal((await call("owner-a", `/cases/103/workroom/${action.id}`, method, data))[0], 404);
      assert.equal((await call("owner-a", actionPath, method, data, "owner-b"))[0], 409);
    }
    const changed = await call("owner-a", actionPath, "PATCH", { revision: 0, status: "doing" });
    assert.equal(changed[0], 200); assert.equal(changed[1].dueOn, "2028-02-29");
    assert.equal(changed[1].revision, 1);
    assert.equal((await call("owner-a", actionPath, "PATCH", { revision: 0, title: "stale" }))[0], 409);
    assert.equal((await call("owner-a", actionPath, "DELETE", { revision: 0 }))[0], 409);
    const cleared = await call("owner-a", actionPath, "PATCH", { revision: 1, dueOn: null });
    assert.equal(cleared[1].dueOn, null);
    const refilled = await call("owner-a", actionPath, "PATCH", { revision: 2, dueOn: "2029-01-01" });
    assert.equal(refilled[1].dueOn, "2029-01-01");
    const race = await Promise.all(["first", "second"].map(body =>
      call("owner-a", actionPath, "PATCH", { revision: 3, body })));
    assert.deepEqual(race.map(r => r[0]).sort(), [200, 409]);
    const journalPath = `${base}/${journal.id}`;
    assert.equal((await call("owner-a", journalPath, "PATCH", { revision: 0, body: "Revised note" }))[0], 200);
    assert.equal((await call("owner-a", journalPath, "PATCH", { revision: 1, status: "done" }))[0], 400);
    assert.equal((await call("owner-a", `${base}/${checklist.id}`, "PATCH", { revision: 0, status: "done" }))[1].status, "done");
    const stored = (await call("owner-a"))[1].items;
    assert.equal(stored.length, 3);
    assert.equal(stored.find(r => r.id === action.id).dueOn, "2029-01-01");
    for (const row of stored) assert.equal((await call("owner-a", `${base}/${row.id}`, "DELETE", { revision: row.revision }))[0], 204);
    assert.deepEqual((await call("owner-a"))[1].items, []);
    assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_cases ORDER BY id")).rows, originalCases);
    assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_evidence ORDER BY id")).rows, originalEvidence);
    await call("owner-a", base, "POST", { kind: "journal", title: "Cascade fixture" });
    await restricted.pool.query("DELETE FROM sbu_cases WHERE id=101");
    assert.equal((await restricted.pool.query("SELECT count(*)::int AS count FROM sbu_workroom_items")).rows[0].count, 0);
  } catch (error) { primaryError = error; throw error; }
  finally {
    const errors = [];
    for (const cleanup of [
      async () => { if (server) await new Promise(resolve => server.close(resolve)); },
      async () => { if (restricted) await restricted.close(); },
      async () => { await bootstrap.query("RESET search_path"); await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); },
      async () => { bootstrap.release(); await admin.end(); },
      async () => { delete globalThis.__workroomPool; await rm(temp, { recursive: true, force: true }); },
    ]) try { await cleanup(); } catch (error) { errors.push(error); }
    if (errors.length && !primaryError) throw new AggregateError(errors, "Workroom fixture cleanup failed.");
    if (errors.length && primaryError) console.error("Workroom cleanup also failed; primary error retained.");
  }
});
