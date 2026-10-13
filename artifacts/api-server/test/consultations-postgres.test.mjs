import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import express from "express";
import { build } from "esbuild";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
const temp = await mkdtemp(join(dir, ".consultation-test-"));
after(() => rm(temp, { recursive: true, force: true }));

test("private consultations persist, isolate owners, use opted-in case context and fail closed", async () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `consult_${randomUUID().replaceAll("-", "")}`;
  const bootstrap = await admin.connect();
  let restricted, server;
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(`SET search_path TO "${schema}"`);
    await bootstrap.query("CREATE TABLE sbu_profiles (LIKE public.sbu_profiles INCLUDING ALL)");
    await bootstrap.query("CREATE TABLE sbu_cases (LIKE public.sbu_cases INCLUDING ALL)");
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/consultations.sql", import.meta.url), "utf8"));
    await bootstrap.query("RESET search_path");
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__consultationPool = restricted.pool;
    let fail = false;
    let sent = [];
    await restricted.pool.query("INSERT INTO sbu_profiles(user_id) VALUES ('owner-a'), ('owner-b')");
    await restricted.pool.query(`INSERT INTO sbu_cases(id,owner_id,company_name,request_type,qualification,classification)
      VALUES (101,'owner-a','A Private','baru','kecil','BG001'),(102,'owner-b','B Private','baru','menengah','BG002')`);
    await build({
      entryPoints: [join(dir, "../src/routes/consultations.ts")],
      outfile: join(temp, "route.mjs"), bundle: true, platform: "node", format: "esm",
      external: ["express", "drizzle-orm", "drizzle-orm/*"],
      plugins: [{
        name: "private-consultation-fixture",
        setup(builder) {
          builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
          builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            resolveDir: dir,
            contents: path === "db" ? `
              import { drizzle } from "drizzle-orm/node-postgres";
              export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
              export const db = drizzle(globalThis.__consultationPool);
            ` : `export const getAuth = req => ({userId: req.get("x-test-user") ?? null});`,
          }));
        },
      }],
    });
    const { createConsultationsRouter } = await import(`${join(temp, "route.mjs")}?test=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use("/api", createConsultationsRouter(async (_mode, messages, _signal, _specialist, context) => {
      sent.push({ messages, context });
      if (fail) throw Error("synthetic provider outage");
      return "Jawaban draf: tinjau bersama penelaah.";
    }));
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (user, path, method = "GET", body, owner = user) => {
      const response = await fetch(base + path, {
        method, headers: { "x-test-user": user, "x-sbu-form-owner": owner, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return [response.status, response.status === 204 ? null : await response.json(), response.headers];
    };
    const create = (caseId, includeCaseContext) => ({
      title: "Klinik awal", mode: "bujk", specialist: "sbuclaw", ...(caseId ? { caseId } : {}),
      ...(includeCaseContext ? { includeCaseContext: true } : {}),
      ...(includeCaseContext ? { expectedCaseContext: {
        companyName: "A Private", requestType: "baru", classification: "BG001",
        qualification: "kecil", status: "draf",
      }} : {}),
    });
    assert.equal((await call("owner-a", "/consultations", "POST", create(102, true)))[0], 404);
    assert.equal((await call("owner-a", "/consultations", "POST", {
      ...create(101, true), expectedCaseContext: { ...create(101, true).expectedCaseContext, companyName: "Old name" },
    }))[0], 409);
    const [linkedStatus, linked] = await call("owner-a", "/consultations", "POST", create(101, false));
    assert.equal(linkedStatus, 201);
    assert.equal(linked.caseId, 101);
    assert.equal(linked.context, "");
    assert.equal((await call("owner-a", `/consultations/${linked.id}`, "DELETE"))[0], 204);
    assert.equal((await call("owner-a", "/consultations", "POST", {
      ...create(), includeCaseContext: true,
    }))[0], 400);
    const [createdStatus, created, headers] = await call("owner-a", "/consultations", "POST", create(101, true));
    assert.equal(createdStatus, 201);
    assert.equal(headers.get("cache-control"), "private, no-store");
    assert.match(created.context, /A Private/);
    assert.doesNotMatch(created.context, /B Private/);
    assert.equal(created.messages.length, 0);
    const path = `/consultations/${created.id}`;
    assert.equal((await call("owner-b", path))[0], 404);
    assert.equal((await call("owner-b", path + "/messages", "POST", {
      content: "Tidak boleh", consent: true, revision: 0, requestId: randomUUID(),
    }))[0], 404);
    assert.equal((await call("owner-b", path, "DELETE"))[0], 404);
    assert.equal((await call("owner-a", path, "GET", undefined, "owner-b"))[0], 409);
    assert.equal((await call("owner-a", path + "/messages", "POST", {
      content: "Tak disetujui", consent: false, revision: 0, requestId: randomUUID(),
    }))[0], 400);
    assert.equal(sent.length, 0);
    fail = true;
    const question = { content: "Apa langkahnya?", consent: true, revision: 0, requestId: randomUUID() };
    assert.equal((await call("owner-a", path + "/messages", "POST", question))[0], 503);
    assert.equal((await call("owner-a", path))[1].messages.length, 0);
    fail = false;
    const [status, saved] = await call("owner-a", path + "/messages", "POST", question);
    assert.equal(status, 200);
    assert.equal(saved.revision, 1);
    assert.equal(saved.messages.length, 2);
    assert.match(sent.at(-1).context, /A Private/);
    assert.equal((await call("owner-a", path + "/messages", "POST", question))[1].messages.length, 2);
    assert.equal((await call("owner-a", path + "/messages", "POST", {
      ...question, requestId: randomUUID(),
    }))[0], 409);
    assert.equal((await call("owner-b", "/consultations"))[1].length, 0);
    assert.equal((await call("owner-a", "/consultations"))[1].length, 1);
    assert.equal((await call("owner-a", path, "PATCH", { title: "Klinik lanjut" }))[1].title, "Klinik lanjut");
    assert.equal((await call("owner-a", path, "DELETE"))[0], 204);
    assert.equal((await call("owner-a", path))[0], 404);
  } finally {
    await new Promise(resolve => server?.close(resolve) ?? resolve());
    if (restricted) await restricted.close();
    await bootstrap.query("RESET search_path");
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    bootstrap.release();
    await admin.end();
    delete globalThis.__consultationPool;
  }
});
