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
test("personnel and SKK API isolate owners, preserve calendar PATCH semantics, protect links and keep documents", async () => {
  const temp = await mkdtemp(join(dir, ".personnel-test-"));
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `personnel_${randomUUID().replaceAll("-", "")}`;
  let restricted, server, primaryError;
  const bootstrap = await admin.connect();
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(`SET search_path TO "${schema}"`);
    await bootstrap.query(`
      CREATE TABLE sbu_profiles (user_id text PRIMARY KEY);
      CREATE TABLE sbu_cases (id integer PRIMARY KEY, owner_id text NOT NULL, company_name text);
      CREATE TABLE sbu_documents (
        id uuid PRIMARY KEY, case_id integer NOT NULL, owner_id text NOT NULL,
        name text NOT NULL, content_type text NOT NULL, size integer NOT NULL, object_path text NOT NULL,
        status text NOT NULL DEFAULT 'ready', scan_status text NOT NULL DEFAULT 'clean',
        scan_generation text, scanned_at timestamptz, category text NOT NULL DEFAULT 'personel',
        description text NOT NULL DEFAULT '', series_id uuid, version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO sbu_profiles VALUES ('owner-a'), ('owner-b');
      INSERT INTO sbu_cases VALUES (101,'owner-a','A'), (102,'owner-b','B'), (103,'owner-a','A2');
    `);
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/personnel.sql", import.meta.url), "utf8"));
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__personnelPool = restricted.pool;
    const docA = randomUUID(), docB = randomUUID(), pending = randomUUID();
    for (const [id, owner, caseId, status] of [[docA, "owner-a", 101, "clean"], [docB, "owner-b", 102, "clean"], [pending, "owner-a", 101, "pending"]]) {
      await restricted.pool.query(`INSERT INTO sbu_documents(id,case_id,owner_id,name,content_type,size,object_path,scan_status)
        VALUES($1,$2,$3,'fixture.pdf','application/pdf',123,'/private/fixture',$4)`, [id, caseId, owner, status]);
    }
    await build({
      entryPoints: [join(dir, "../src/routes/personnel.ts")], outfile: join(temp, "route.mjs"),
      bundle: true, platform: "node", format: "esm", external: ["express", "drizzle-orm", "drizzle-orm/*"],
      plugins: [{ name: "isolated-personnel", setup(builder) {
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          resolveDir: dir,
          contents: path === "db" ? `
            import { drizzle } from "drizzle-orm/node-postgres";
            export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
            export const db = drizzle(globalThis.__personnelPool);
          ` : `export const getAuth = req => ({userId: req.get("x-test-user") ?? null});`,
        }));
      }}],
    });
    const { createPersonnelRouter } = await import(join(temp, "route.mjs"));
    const app = express(); app.use(express.json()); app.use("/api", createPersonnelRouter());
    app.use((error, _req, res, _next) => { console.error("Isolated route failure:", error.message); res.status(500).json({ error: "test error" }); });
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const call = async (user, path, method = "GET", data, formOwner = user) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}),
          ...(formOwner ? { "x-sbu-form-owner": formOwner } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return [response.status, response.status === 204 ? null : await response.json(), response.headers];
    };
    const personBody = { fullName: "Person A", assignment: "pjt", position: "Manajer", caseId: 101, notes: "Fixture" };
    assert.equal((await call(null, "/personnel"))[0], 401);
    assert.equal((await call("owner-b", "/personnel", "POST", personBody, "owner-a"))[0], 409);
    assert.equal((await call("owner-b", "/personnel", "POST", personBody))[0], 404);
    assert.equal((await call("owner-a", "/personnel", "POST", { ...personBody, fullName: "\u200b" }))[0], 400);
    const [createdStatus, person, headers] = await call("owner-a", "/personnel", "POST", personBody);
    assert.equal(createdStatus, 201); assert.equal(headers.get("cache-control"), "private, no-store");
    const path = `/personnel/${person.id}`;
    assert.deepEqual((await call("owner-b", "/personnel"))[1], []);
    for (const method of ["GET", "PATCH", "DELETE"]) {
      assert.equal((await call("owner-b", path, method, method === "PATCH" ? { fullName: "B", expectedRevision: 0 } : undefined))[0], 404);
    }
    const certBody = { certificateNumber: "Fixture-SKK-01", issuer: "Fixture LSP", jobTitle: "Jabatan tercatat", level: 6,
      issuedOn: "2026-01-01", expiresOn: "2029-01-01", documentId: docA, notes: "" };
    assert.equal((await call("owner-a", `${path}/certificates`, "POST", { ...certBody, documentId: docB }))[0], 404);
    assert.equal((await call("owner-a", `${path}/certificates`, "POST", { ...certBody, documentId: pending }))[0], 400);
    for (const expiresOn of ["2026-02-30", "2025-12-31", "2029-01-01T00:00:00Z"]) {
      assert.equal((await call("owner-a", `${path}/certificates`, "POST", { ...certBody, expiresOn }))[0], 400);
    }
    const [certStatus, withCert] = await call("owner-a", `${path}/certificates`, "POST", certBody);
    assert.equal(certStatus, 201);
    assert.equal(withCert.certificates[0].expiresOn, "2029-01-01"); // actual response JSON, not just ORM output
    assert.equal(withCert.certificates[0].issuedOn, "2026-01-01");
    const certPath = `${path}/certificates/${withCert.certificates[0].id}`;
    assert.equal((await call("owner-b", certPath, "DELETE"))[0], 404);
    assert.equal((await call("owner-b", certPath, "PATCH", { expectedRevision: 0, notes: "B" }))[0], 404);
    assert.equal((await call("owner-a", path, "PATCH", { expectedRevision: 0, caseId: 103 }))[0], 400);
    const [patchStatus, omitted] = await call("owner-a", certPath, "PATCH", { expectedRevision: 0, notes: "Edited" });
    assert.equal(patchStatus, 200);
    assert.equal(omitted.certificates[0].expiresOn, "2029-01-01");
    assert.equal((await call("owner-a", certPath, "PATCH", { expectedRevision: 0, expiresOn: null }))[0], 409);
    const cleared = (await call("owner-a", certPath, "PATCH", { expectedRevision: 1, expiresOn: null, documentId: null }))[1];
    assert.equal(cleared.certificates[0].expiresOn, null);
    assert.equal(cleared.certificates[0].dateStatus, "unknown");
    assert.equal(cleared.certificates[0].documentId, null);
    const refilled = (await call("owner-a", certPath, "PATCH", { expectedRevision: 2, expiresOn: "2028-02-29", documentId: docA }))[1];
    assert.equal(refilled.certificates[0].expiresOn, "2028-02-29");
    assert.equal(refilled.certificates[0].revision, 3);
    assert.equal((await call("owner-a", path, "PATCH", { expectedRevision: 0, notes: "Updated person" }))[0], 200);
    assert.equal((await call("owner-a", path, "PATCH", { expectedRevision: 0, notes: "Lost update" }))[0], 409);
    assert.equal((await call("owner-a", certPath, "DELETE"))[0], 204);
    assert.equal((await call("owner-a", path))[1].certificates.length, 0);
    await call("owner-a", `${path}/certificates`, "POST", certBody);
    assert.equal((await call("owner-a", path, "DELETE"))[0], 204);
    assert.equal((await call("owner-a", path))[0], 404);
    assert.equal((await restricted.pool.query("SELECT count(*)::int AS n FROM sbu_skk_certificates")).rows[0].n, 0);
    assert.equal((await restricted.pool.query("SELECT count(*)::int AS n FROM sbu_documents")).rows[0].n, 3);
    const denied = await restricted.pool.query("SELECT has_table_privilege(current_user,'public.sbu_cases','INSERT') AS allowed");
    assert.equal(denied.rows[0].allowed, false);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    for (const cleanup of [
      async () => { if (server) await new Promise(resolve => server.close(resolve)); },
      async () => { if (restricted) await restricted.close(); },
      async () => { await bootstrap.query("RESET search_path"); await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); },
      async () => { bootstrap.release(); await admin.end(); },
      async () => { delete globalThis.__personnelPool; await rm(temp, { recursive: true, force: true }); },
    ]) {
      try { await cleanup(); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length && !primaryError) throw new AggregateError(cleanupErrors, "Isolated personnel cleanup failed");
    if (cleanupErrors.length && primaryError) console.error("Personnel fixture cleanup also failed; primary test error retained.");
  }
});
