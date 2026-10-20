import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
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
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/document-malware.sql", import.meta.url), "utf8"));
    await bootstrap.query(`ALTER TABLE sbu_documents
      ADD COLUMN category text NOT NULL DEFAULT 'lainnya',
      ADD COLUMN description text NOT NULL DEFAULT '',
      ADD COLUMN series_id uuid,
      ADD COLUMN version integer NOT NULL DEFAULT 1`);
    await bootstrap.query("CREATE TABLE sbu_document_analyses (LIKE public.sbu_document_analyses INCLUDING ALL)");
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/document-analysis-pages.sql", import.meta.url), "utf8"));
    await bootstrap.query("RESET search_path");
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__standalonePool = restricted.pool;
    globalThis.__standaloneStorageCalls = [];
    globalThis.__standaloneStorageFailure = false;
    globalThis.__standaloneScanVerdict = "clean";
    globalThis.__standaloneGenerateCalls = 0;
    globalThis.__standaloneAnalysisFailure = false;
    const syntheticPdf = await PDFDocument.create();
    for (let p = 1; p <= 18; p++) syntheticPdf.addPage().drawText(`UNIQUE_PAGE_${p}_PRIVATE_MARKER`);
    syntheticPdf.setTitle("PRIVATE_METADATA_DO_NOT_SEND");
    await syntheticPdf.attach(Buffer.from("PRIVATE_ATTACHMENT_DO_NOT_SEND"), "secret.txt");
    globalThis.__standaloneBytes = Buffer.from(await syntheticPdf.save());
    globalThis.__standaloneGenerate = async (bytes, contentType, input) => {
      globalThis.__standaloneGenerateCalls++;
      globalThis.__standaloneSent = { bytes, contentType, input };
      if (globalThis.__standaloneAnalysisFailure) throw new Error("synthetic provider error");
      return { summary: "Synthetic preliminary review", extracted: [], concerns: [],
        missingInformation: ["Not visible in this synthetic document"], nextSteps: ["Human review"] };
    };
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
          builder.onResolve({ filter: /^\.\/document-analysis$/ }, (args) =>
            args.importer.endsWith("/routes/sbu.ts") ? { path: "analysis-router", namespace: "fixture" } : undefined);
          builder.onResolve({ filter: /\/document-storage$/ }, () => ({ path: "storage", namespace: "fixture" }));
          builder.onResolve({ filter: /\/workspace-context$/ }, () => ({ path: join(dir, "helpers/workspace-context-fixture.mjs") }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: path === "db" ? `
              import { drizzle } from "drizzle-orm/node-postgres";
              export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
              export const db = drizzle(globalThis.__standalonePool);
            ` : path === "auth" ? `export const getAuth = req => ({ userId: req.get("x-test-user") ?? null });`
              : path === "analysis-router" ? `
              import {createDocumentAnalysisRouter} from ${JSON.stringify(join(dir, "../src/routes/document-analysis.ts"))};
              export default createDocumentAnalysisRouter(globalThis.__standaloneGenerate, async () => {});
            ` : `
              import { Readable } from "node:stream";
              export class DocumentValidationError extends Error {}
              export const documentStorage = {
                reserve: async () => { globalThis.__standaloneStorageCalls.push("reserve"); return {uploadURL:"https://invalid.test/synthetic-upload", objectPath:"/objects/uploads/synthetic-"+Date.now()}; },
                seal: async (path,id) => { globalThis.__standaloneStorageCalls.push("seal"); if(globalThis.__standaloneStorageFailure) throw new DocumentValidationError(); return "/objects/documents/"+id; },
                remove: async path => { globalThis.__standaloneStorageCalls.push("remove"); if(globalThis.__standaloneStorageFailure) throw new Error("storage failure"); },
                scan: async () => { globalThis.__standaloneStorageCalls.push("scan"); return {verdict:globalThis.__standaloneScanVerdict,generation:"123"}; },
                file: async (path,generation) => { globalThis.__standaloneStorageCalls.push("file");
                  globalThis.__standaloneDownloadGeneration = generation;
                  if(globalThis.__standaloneStorageFailure) throw new Error("storage failure");
                  return {getMetadata:async()=>[{size:String(globalThis.__standaloneBytes.length),contentType:"application/pdf"}],download:async()=>[globalThis.__standaloneBytes],
                    createReadStream:()=>Readable.from(["synthetic PDF"])}; }
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
      if (method === "POST" && path.endsWith("/analyses") && body) {
        const documentId = path.split("/")[4];
        const sourceRevision = createHash("sha256").update(JSON.stringify([documentId, 1, "123"])).digest("hex");
        body = { pages: [2, 15], sourceRevision, ...body };
      }
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { ...(user ? { "x-test-user": user } : {}), ...(formOwner ? { "X-SBU-Form-Owner": formOwner } : {}), "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, cache: response.headers.get("cache-control"),
        attachment: response.headers.get("content-disposition"),
        body: text ? response.headers.get("content-type") === "application/pdf" ? text : JSON.parse(text) : null };
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
    const metadata = { name: "test.pdf", size: globalThis.__standaloneBytes.length, contentType: "application/pdf" };
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
    // Cleanup can stop awaiting a provider DELETE and release its lock. Such a
    // target must remain permanently ineligible for completion, even when its
    // pending row is kept for retry. Exercise the real handler, not a mock of
    // the age check, at both the completion window and cleanup grace.
    for (const age of [31 * 60_000, 49 * 60 * 60_000]) {
      await restricted.pool.query("UPDATE sbu_documents SET created_at=$2 WHERE id=$1",
        [documentId, new Date(Date.now() - age)]);
      const beforeExpiredCompletion = [...globalThis.__standaloneStorageCalls];
      assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`)).status, 422);
      assert.deepEqual(globalThis.__standaloneStorageCalls, beforeExpiredCompletion,
        "expired reservations cannot seal or scan, including after cleanup timeout");
      assert.equal((await restricted.pool.query("SELECT status FROM sbu_documents WHERE id=$1",
        [documentId])).rows[0].status, "pending");
    }
    await restricted.pool.query("UPDATE sbu_documents SET created_at=now() WHERE id=$1", [documentId]);
    globalThis.__standaloneStorageFailure = true;
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`)).status, 422);
    assert.equal((await call("GET", `/cases/${a.id}/documents`)).body[0].status, "pending");
    globalThis.__standaloneStorageFailure = false;
    globalThis.__standaloneScanVerdict = "error";
    const failedScan = await call("POST", `/cases/${a.id}/documents/${documentId}/complete`);
    assert.equal(failedScan.body.status, "ready");
    assert.equal(failedScan.body.scanStatus, "error");
    assert.equal(failedScan.body.scanGeneration, undefined);
    const callsAfterFailure = [...globalThis.__standaloneStorageCalls];
    assert.equal((await call("GET", `/cases/${a.id}/documents/${documentId}/download`)).status, 404);
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/analyses`, "test-owner-a", { consent: true, focus: "keuangan" })).status, 404);
    assert.deepEqual(globalThis.__standaloneStorageCalls, callsAfterFailure, "quarantine does not read/download original");
    assert.equal((await call("GET", `/cases/${a.id}/documents`)).body.length, 1, "scan failure retains original record");
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`, "test-owner-a", undefined, "test-owner-b")).status, 409);
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`, "test-owner-b")).status, 404);
    assert.deepEqual(globalThis.__standaloneStorageCalls, callsAfterFailure, "foreign/stale form does not invoke scanner");
    globalThis.__standaloneScanVerdict = "clean";
    const retry = await call("POST", `/cases/${a.id}/documents/${documentId}/complete`);
    assert.equal(retry.body.scanStatus, "clean");
    assert.equal(retry.body.scanGeneration, undefined);
    const download = await call("GET", `/cases/${a.id}/documents/${documentId}/download`);
    assert.equal(download.status, 200);
    assert.equal(download.cache, "private, no-store");
    assert.match(download.attachment, /^attachment;/);
    assert.equal(globalThis.__standaloneDownloadGeneration, "123", "download uses scanned immutable generation");
    const seals = globalThis.__standaloneStorageCalls.filter(c => c === "seal").length;
    assert.equal((await call("POST", `/cases/${a.id}/documents/${documentId}/complete`)).body.status, "ready");
    assert.equal(globalThis.__standaloneStorageCalls.filter(c => c === "seal").length, seals, "completion is idempotent");
    // An old ready document is NOT implicitly trusted, and infected files are
    // never re-sealed/released or silently removed by scan/completion retries.
    const isolated = await call("POST", `/cases/${a.id}/documents`, "test-owner-a", metadata);
    const isolatedPath = `/cases/${a.id}/documents/${isolated.body.document.id}`;
    await restricted.pool.query("UPDATE sbu_documents SET status='ready' WHERE id=$1", [isolated.body.document.id]);
    assert.equal((await call("GET", `${isolatedPath}/download`)).status, 404);
    globalThis.__standaloneScanVerdict = "infected";
    const infected = await call("POST", `${isolatedPath}/complete`);
    assert.equal(infected.body.scanStatus, "infected");
    const scans = globalThis.__standaloneStorageCalls.filter(c => c === "scan").length;
    assert.equal((await call("POST", `${isolatedPath}/complete`)).body.scanStatus, "infected");
    assert.equal(globalThis.__standaloneStorageCalls.filter(c => c === "scan").length, scans);
    assert.equal((await call("GET", `${isolatedPath}/download`)).status, 404);
    assert.equal((await call("GET", "/documents")).body.total, 2);
    assert.equal((await call("DELETE", isolatedPath)).status, 204, "only explicit owner deletion removes quarantined file");
    globalThis.__standaloneScanVerdict = "clean";
    const vault = await call("GET", "/documents?category=lainnya&page=1");
    assert.equal(vault.status, 200);
    assert.equal(vault.cache, "private, no-store");
    assert.equal(vault.body.userId, "test-owner-a");
    assert.equal(vault.body.total, 1);
    assert.equal(vault.body.documents[0].version, 1);
    assert.equal(vault.body.documents[0].seriesId, documentId);
    assert.equal("objectPath" in vault.body.documents[0], false);
    assert.equal((await call("GET", "/documents", null)).status, 401);
    assert.equal((await call("GET", "/documents", "test-owner-b")).body.total, 0);
    assert.equal((await call("GET", "/documents?page=-1")).status, 400);
    const labels = { name: "Renamed.pdf", category: "keuangan", description: "Financial synthetic notes" };
    const path = `/cases/${a.id}/documents/${documentId}`;
    assert.equal((await call("PATCH", path, "test-owner-b", labels)).status, 404);
    assert.equal((await call("PATCH", path, "test-owner-a", labels, "test-owner-b")).status, 409);
    assert.equal((await call("PATCH", path, "test-owner-a", { ...labels, objectPath: "forged" })).status, 400);
    assert.equal((await call("PATCH", path, "test-owner-a", labels)).body.category, "keuangan");
    assert.equal((await call("GET", "/documents?q=synthetic&category=keuangan")).body.total, 1);
    assert.equal((await call("GET", "/documents?q=absent")).body.total, 0);
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-a", { consent: false, focus: "keuangan" })).status, 400);
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-b", { consent: true, focus: "keuangan" })).status, 404);
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-a", { consent: true, focus: "keuangan" }, "test-owner-b")).status, 409);
    assert.deepEqual((await call("GET", `${path}/analyses`)).body, []);
    assert.equal((await call("GET", `${path}/analyses`, "test-owner-b")).status, 404);
    assert.equal(globalThis.__standaloneGenerateCalls, 0, "no unauthorized or unconsented request reaches AI");
    const info = await call("GET", `${path}/analysis-source`);
    assert.equal(info.status, 200);
    assert.equal(info.body.pageCount, 18);
    assert.equal(info.body.documentId, documentId);
    const beforeInvalid = globalThis.__standaloneStorageCalls.length;
    for (const [user, formOwner, status] of [
      [null, null, 401], ["test-owner-b", "test-owner-b", 404], ["test-owner-a", "test-owner-b", 409],
    ]) assert.equal((await call("GET", `${path}/analysis-source`, user, undefined, formOwner)).status, status);
    for (const pages of [[], [0], [-1], [1.5], [1, 1], Array.from({ length: 11 }, (_, i) => i + 1)]) {
      assert.equal((await call("POST", `${path}/analyses`, "test-owner-a", { consent: true, focus: "keuangan", pages })).status, 400);
    }
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-a",
      { consent: true, focus: "keuangan", sourceRevision: "0".repeat(64) })).status, 409);
    assert.equal(globalThis.__standaloneStorageCalls.length, beforeInvalid, "invalid input/owner/revision rejected before reading file");
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-a",
      { consent: true, focus: "keuangan", pages: [19] })).status, 422);
    assert.equal(globalThis.__standaloneGenerateCalls, 0);
    globalThis.__standaloneAnalysisFailure = true;
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-a", { consent: true, focus: "keuangan" })).status, 503);
    assert.equal((await call("GET", `${path}/analyses`)).body.length, 0, "provider failure is not a saved result");
    globalThis.__standaloneAnalysisFailure = false;
    const analyzed = await call("POST", `${path}/analyses`, "test-owner-a", { consent: true, focus: "keuangan" });
    assert.equal(analyzed.status, 201);
    assert.equal(analyzed.cache, "private, no-store");
    assert.equal(analyzed.body.ownerId, "test-owner-a");
    assert.equal(analyzed.body.documentId, documentId);
    assert.deepEqual(analyzed.body.sourcePages, [2, 15]);
    assert.equal(analyzed.body.sourcePageCount, 18);
    assert.equal(analyzed.body.sourceVersion, 1);
    const sent = globalThis.__standaloneSent;
    assert.equal(sent.contentType, "application/pdf");
    assert.equal((await PDFDocument.load(sent.bytes)).getPageCount(), 2);
    assert.notDeepEqual(sent.bytes, globalThis.__standaloneBytes);
    const history = await call("GET", `${path}/analyses`);
    assert.equal(history.body.length, 1);
    assert.deepEqual(history.body[0].sourcePages, [2, 15], "page snapshot persists across a new read");
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-a", { consent: true, focus: "keuangan" })).status, 429,
      "local preparation failures and provider failures count toward per-owner rate limit");
    const savedRow = await restricted.pool.query("SELECT source_pages, source_version FROM sbu_document_analyses WHERE id=$1", [analyzed.body.id]);
    assert.deepEqual(savedRow.rows[0].source_pages, [2, 15]);
    const callsBeforeQuota = globalThis.__standaloneStorageCalls.length;
    await restricted.pool.query(`INSERT INTO sbu_document_analyses
      (id, document_id, case_id, owner_id, focus, result, model)
      SELECT gen_random_uuid(), document_id, case_id, owner_id, focus, result, model
      FROM sbu_document_analyses CROSS JOIN generate_series(1,9) WHERE id=$1`, [analyzed.body.id]);
    assert.equal((await call("POST", `${path}/analyses`, "test-owner-a", { consent: true, focus: "keuangan" })).status, 429);
    assert.equal(globalThis.__standaloneStorageCalls.length, callsBeforeQuota, "stored result quota rejects before file access");
    const legacyHistory = (await call("GET", `${path}/analyses`)).body;
    assert.equal(legacyHistory.filter(r => r.sourcePages === null).length, 9, "legacy rows do not invent a page mapping");
    await restricted.pool.query("DELETE FROM sbu_document_analyses WHERE document_id=$1 AND id<>$2", [documentId, analyzed.body.id]);
    const resultPath = `${path}/analyses/${analyzed.body.id}`;
    assert.equal((await call("DELETE", resultPath, "test-owner-b")).status, 404);
    assert.equal((await call("DELETE", resultPath, "test-owner-a", undefined, "test-owner-b")).status, 409);
    assert.equal((await call("DELETE", resultPath)).status, 204);
    assert.equal((await call("GET", `${path}/analyses`)).body.length, 0);
    assert.equal((await call("GET", "/documents")).body.total, 1, "removing analysis does not remove document");
    const next = await call("POST", `/cases/${a.id}/documents`, "test-owner-a", { ...metadata, versionOf: documentId });
    assert.equal(next.status, 201);
    assert.equal(next.body.document.seriesId, documentId);
    assert.equal(next.body.document.version, 2);
    assert.equal(next.body.document.category, "keuangan");
    assert.notEqual(next.body.document.id, documentId);
    assert.equal((await call("GET", "/documents")).body.total, 2, "old version is not overwritten");
    assert.equal((await call("POST", `/cases/${b.id}/documents`, "test-owner-b", { ...metadata, versionOf: documentId })).status, 404);
    assert.equal((await call("DELETE", `/cases/${a.id}/documents/${next.body.document.id}`)).status, 204);
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
    delete globalThis.__standaloneGenerate;
    delete globalThis.__standaloneGenerateCalls;
    delete globalThis.__standaloneAnalysisFailure;
    delete globalThis.__standaloneScanVerdict;
    delete globalThis.__standaloneDownloadGeneration;
    delete globalThis.__standaloneBytes;
    delete globalThis.__standaloneSent;
    if (restricted) await restricted.close();
    await bootstrap.query("RESET search_path").catch(() => {});
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    bootstrap.release();
    await admin.end();
  }
});
