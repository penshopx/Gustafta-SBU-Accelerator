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

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".standalone-test-"));
after(() => rm(temp, { recursive: true, force: true }));

test("standalone profiles/documents isolate owners and preserve records after storage failures", async () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `standalone_${randomUUID().replaceAll("-", "")}`;
  const bootstrap = await admin.connect();
  let restricted, server;
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(`SET search_path TO "${schema}"`);
    await bootstrap.query("CREATE TABLE sbu_profiles (LIKE public.sbu_profiles INCLUDING ALL)");
    await bootstrap.query("CREATE TABLE sbu_cases (LIKE public.sbu_cases INCLUDING ALL)");
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/standalone-documents.sql", import.meta.url), "utf8"));
    await bootstrap.query("RESET search_path");
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__standalonePool = restricted.pool;
    globalThis.__standaloneStorageCalls = [];
    globalThis.__standaloneStorageFailure = false;
    await restricted.pool.query("INSERT INTO sbu_profiles(user_id) VALUES ('test-owner-a'), ('test-owner-b')");
    const { rows: [a, b] } = await restricted.pool.query(`INSERT INTO sbu_cases(id, owner_id, company_name, request_type, qualification, classification)
      VALUES (1,'test-owner-a','Isolated A','baru','kecil','konstruksi'), (2,'test-owner-b','Isolated B','baru','kecil','konstruksi') RETURNING id`);
    await build({
      entryPoints: [join(dir, "../src/routes/sbu.ts")], outfile: join(temp, "route.mjs"),
      bundle: true, platform: "node", format: "esm", external: ["express", "@google-cloud/*", "drizzle-orm", "drizzle-orm/*"],
      plugins: [{
        name: "standalone-isolation",
        setup(builder) {
          builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
          builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
          builder.onResolve({ filter: /\/document-storage$/ }, () => ({ path: "storage", namespace: "fixture" }));
          builder.onResolve({ filter: /\/workspace-context$/ }, () => ({ path: join(dir, "helpers/workspace-context-fixture.mjs") }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: path === "db" ? `
              import { drizzle } from "drizzle-orm/node-postgres";
              export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
              export const db = drizzle(globalThis.__standalonePool);
            ` : path === "auth" ? `export const getAuth = req => ({ userId: req.get("x-test-user") ?? null });` : `
              export class DocumentValidationError extends Error {}
              export const documentStorage = {
                reserve: async () => { globalThis.__standaloneStorageCalls.push("reserve"); return {uploadURL:"https://invalid.test/synthetic-upload", objectPath:"/objects/uploads/synthetic-"+Date.now()}; },
                seal: async (path,id) => { globalThis.__standaloneStorageCalls.push("seal"); if(globalThis.__standaloneStorageFailure) throw new DocumentValidationError(); return "/objects/documents/"+id; },
                remove: async path => { globalThis.__standaloneStorageCalls.push("remove"); if(globalThis.__standaloneStorageFailure) throw new Error("storage failure"); },
                file: async () => { globalThis.__standaloneStorageCalls.push("file"); throw new Error("not part of this fixture"); }
              };
            `, loader: "ts", resolveDir: dir,
          }));
        },
      }],
    });
    const { default: router } = await import(join(temp, "route.mjs"));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.log = { warn() {} }; next(); });
    app.use("/api", router);
    server = app.listen(0);
    const call = async (method, path, user = "test-owner-a", body, formOwner = user) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { ...(user ? { "x-test-user": user } : {}), ...(formOwner ? { "X-SBU-Form-Owner": formOwner } : {}), "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, cache: response.headers.get("cache-control"), body: text ? JSON.parse(text) : null };
    };
    assert.equal((await call("GET", "/company-profile", null)).status, 401);
    const input = { companyName: "Isolated A", nib: "1234567890123", npwp: "", address: "Synthetic", responsiblePerson: "Test" };
    assert.equal((await call("PUT", "/company-profile", "test-owner-a", input, "test-owner-b")).status, 409);
    assert.equal((await call("PUT", "/company-profile", "test-owner-a", { ...input, ownerId: "test-owner-b" })).status, 400);
    const company = await call("PUT", "/company-profile", "test-owner-a", input);
    assert.equal(company.status, 200);
    assert.equal(company.cache, "private, no-store");
    assert.equal(company.body.ownerId, "test-owner-a");
    assert.equal((await call("GET", "/company-profile", "test-owner-b")).body.companyName, "");
    assert.equal((await call("GET", "/company-profile")).body.companyName, "Isolated A");
    const metadata = { name: "test.pdf", size: 22, contentType: "application/pdf" };
    assert.equal((await call("POST", `/cases/${b.id}/documents`, "test-owner-a", metadata)).status, 404);
    assert.equal((await call("POST", `/cases/${a.id}/documents`, "test-owner-a", metadata, "test-owner-b")).status, 409);
    assert.equal((await call("POST", `/cases/${a.id}/documents`, "test-owner-a", { ...metadata, size: 20971521 })).status, 400);
    assert.equal((await call("POST", `/cases/${a.id}/documents`, "test-owner-a", { ...metadata, contentType: "text/html" })).status, 400);
    assert.equal(globalThis.__standaloneStorageCalls.length, 0);
    const upload = await call("POST", `/cases/${a.id}/documents`, "test-owner-a", metadata);
    assert.equal(upload.status, 201);
    assert.equal(upload.body.document.status, "pending");
    assert.equal(upload.body.document.objectPath, undefined);
    const documentId = upload.body.document.id;
    for (const [method, tail] of [["GET", ""], ["GET", `/${documentId}/download`], ["POST", `/${documentId}/complete`], ["DELETE", `/${documentId}`]]) {
      const result = await call(method, `/cases/${a.id}/documents${tail}`, "test-owner-b");
      assert.equal(result.status, 404);
    }
    assert.deepEqual(globalThis.__standaloneStorageCalls, ["reserve"]);
    assert.equal((await call("GET", `/cases/${a.id}/documents`)).body.length, 1);
    globalThis.__standaloneStorageFailure = true;
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`)).status, 422);
    assert.equal((await call("GET", `/cases/${a.id}/documents`)).body[0].status, "pending");
    globalThis.__standaloneStorageFailure = false;
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`)).body.status, "ready");
    const seals = globalThis.__standaloneStorageCalls.filter(c => c === "seal").length;
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`)).body.status, "ready");
    assert.equal(globalThis.__standaloneStorageCalls.filter(c => c === "seal").length, seals, "completion is idempotent");
    assert.equal((await call("DELETE", `/cases/${a.id}`)).status, 409, "case cannot orphan original documents");
    globalThis.__standaloneStorageFailure = true;
    assert.equal((await call("DELETE", `/cases/${a.id}/documents/${documentId}`)).status, 503);
    assert.equal((await call("GET", `/cases/${a.id}/documents`)).body.length, 1);
    globalThis.__standaloneStorageFailure = false;
    assert.equal((await call("DELETE", `/cases/${a.id}/documents/${documentId}`)).status, 204);
    assert.equal((await call("GET", `/cases/${a.id}/documents`)).body.length, 0);
    assert.equal((await call("DELETE", `/cases/${a.id}`)).status, 204);
    assert.equal((await call("GET", `/cases/${b.id}/documents`, "test-owner-b")).status, 200);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    delete globalThis.__standalonePool;
    if (restricted) await restricted.close();
    await bootstrap.query("RESET search_path").catch(() => {});
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    bootstrap.release();
    await admin.end();
  }
});
