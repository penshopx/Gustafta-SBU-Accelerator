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
    await bootstrap.query("CREATE TABLE sbu_documents (LIKE public.sbu_documents INCLUDING ALL)");
    await bootstrap.query("CREATE TABLE sbu_document_analyses (LIKE public.sbu_document_analyses INCLUDING ALL)");
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/consultations.sql", import.meta.url), "utf8"));
    await bootstrap.query(await readFile(new URL("../../../lib/db/migrations/document-analysis-operations.sql", import.meta.url), "utf8"));
    await bootstrap.query("RESET search_path");
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__consultationPool = restricted.pool;
    let fail = false;
    let sent = [];
    await restricted.pool.query("INSERT INTO sbu_profiles(user_id) VALUES ('owner-a'), ('owner-b')");
    await restricted.pool.query(`INSERT INTO sbu_cases(id,owner_id,company_name,request_type,qualification,classification)
      VALUES (101,'owner-a','A Private','baru','kecil','BG001'),(102,'owner-b','B Private','baru','menengah','BG002')`);
    await build({
      entryPoints: { route: join(dir, "../src/routes/consultations.ts"), analysis: join(dir, "../src/routes/document-analysis.ts") },
      outdir: temp, outExtension: { ".js": ".mjs" }, bundle: true, platform: "node", format: "esm",
      external: ["express", "drizzle-orm", "drizzle-orm/*", "pdf-lib"],
      plugins: [{
        name: "private-consultation-fixture",
        setup(builder) {
          builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
          builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
          builder.onResolve({ filter: /\/lib\/document-storage$/ }, () => ({ path: "storage", namespace: "fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            resolveDir: dir,
            contents: path === "db" ? `
              import { drizzle } from "drizzle-orm/node-postgres";
              export * from ${JSON.stringify(fileURLToPath(new URL("../../../lib/db/src/schema/index.ts", import.meta.url)))};
              export const pool = globalThis.__consultationPool;
              export const db = drizzle(pool);
            ` : path === "storage" ? `export const documentStorage = { file() { throw Error("must not read original bytes"); } };`
              : `export const getAuth = req => ({userId: req.get("x-test-user") ?? null});`,
          }));
        },
      }],
    });
    const { createConsultationsRouter } = await import(`${join(temp, "route.mjs")}?test=${Date.now()}`);
    const { createDocumentAnalysisRouter } = await import(`${join(temp, "analysis.mjs")}?test=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use("/api", createConsultationsRouter(async (_mode, messages, _signal, _specialist, context) => {
      sent.push({ messages, context });
      if (fail) throw Error("synthetic provider outage");
      return "Jawaban draf: tinjau bersama penelaah.";
    }, async () => {}));
    app.use("/api", createDocumentAnalysisRouter(async () => { throw Error("must not analyze original"); }));
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

    const documentId = randomUUID(), analysisId = randomUUID(), otherAnalysis = randomUUID();
    const result = { summary: "Ringkasan privat terpilih", extracted: [{ label: "Nilai", value: "Hanya nilai terpilih", location: "halaman 2" }],
      concerns: ["Perlu telaah manusia"], missingInformation: [], nextSteps: ["Tinjau draf"] };
    await restricted.pool.query(`INSERT INTO sbu_documents(id,case_id,owner_id,name,content_type,size,object_path,status,scan_status,scan_generation,version)
      VALUES ($1,101,'owner-a','Original secret filename','application/pdf',100,'must-not-read-original','ready','clean','gen-a',2)`, [documentId]);
    await restricted.pool.query(`INSERT INTO sbu_document_analyses(id,document_id,case_id,owner_id,focus,result,model,source_pages,source_page_count,source_version)
      VALUES ($1,$2,101,'owner-a','kesiapan_sbu',$3,'test-model','[2,4]',5,2),
             ($4,$2,101,'owner-a','legalitas',$5,'test-model','[1]',5,2)`,
      [analysisId, documentId, result, otherAnalysis, { ...result, summary: "OTHER_ANALYSIS_SECRET" }]);
    const previewPath = `/cases/101/documents/${documentId}/analyses/${analysisId}/consultation-preview`;
    const [previewStatus, preview, previewHeaders] = await call("owner-a", previewPath);
    assert.equal(previewStatus, 200);
    assert.equal(previewHeaders.get("cache-control"), "private, no-store");
    assert.match(preview.text, /Ringkasan privat terpilih/);
    assert.doesNotMatch(JSON.stringify(preview), /OTHER_ANALYSIS_SECRET|must-not-read|Original secret/);
    assert.equal((await call("owner-b", previewPath))[0], 404);
    assert.equal((await call("owner-a", previewPath, "GET", undefined, "owner-b"))[0], 409);
    const selection = { documentId, analysisId, revision: preview.revision, excerpt: "Ringkasan privat terpilih", consent: true };
    const withAnalysis = { ...create(101, false), analysisSelection: selection };
    await restricted.pool.query("UPDATE sbu_cases SET company_name=$1 WHERE id=101", ["X".repeat(8200)]);
    assert.equal((await call("owner-a", "/consultations", "POST", {
      ...create(101, true), expectedCaseContext: { ...create(101, true).expectedCaseContext, companyName: "X".repeat(8200) },
    }))[0], 400, "oversized saved context is rejected before insertion or provider calls");
    await restricted.pool.query("UPDATE sbu_cases SET company_name='A Private' WHERE id=101");
    assert.equal((await call("owner-a", "/consultations", "POST", { ...create(), analysisSelection: selection }))[0], 400);
    assert.equal((await call("owner-a", "/consultations", "POST", { ...withAnalysis, caseId: 102 }))[0], 404);
    const foreignId = randomUUID();
    await restricted.pool.query(`INSERT INTO sbu_document_analyses(id,document_id,case_id,owner_id,focus,result,model,source_pages,source_version)
      VALUES ($1,$2,101,'owner-b','legalitas',$3,'test-model','[1]',2)`, [foreignId, documentId, result]);
    assert.equal((await call("owner-a", "/consultations", "POST", {
      ...withAnalysis, analysisSelection: { ...selection, analysisId: foreignId },
    }))[0], 404, "a foreign analysis on the selected document remains private");
    for (const change of [{ excerpt: "made up" }, { excerpt: "x".repeat(4001) }, { consent: false }, { revision: "0".repeat(64) }]) {
      assert.ok([400,409].includes((await call("owner-a", "/consultations", "POST", {
        ...withAnalysis, analysisSelection: { ...selection, ...change },
      }))[0]));
    }
    const [analysisStatus, analysisConsultation] = await call("owner-a", "/consultations", "POST", withAnalysis);
    assert.equal(analysisStatus, 201);
    const snap = JSON.parse(analysisConsultation.context).analysisSnapshot;
    assert.equal(snap.excerpt, selection.excerpt);
    assert.deepEqual(snap.sourcePages, [2,4]);
    assert.equal(snap.sourceVersion, 2);
    assert.equal(snap.analysisId, analysisId);
    assert.doesNotMatch(analysisConsultation.context, /A Private|OTHER_ANALYSIS_SECRET|Hanya nilai terpilih|Original secret|must-not-read/);
    const analysisPath = `/consultations/${analysisConsultation.id}`;
    assert.equal((await call("owner-a", analysisPath))[1].context, analysisConsultation.context, "snapshot survives reload");
    const message = { content: "Tinjau cuplikan ini", consent: true, revision: 0, requestId: randomUUID() };
    assert.equal((await call("owner-a", analysisPath + "/messages", "POST", message))[0], 200);
    assert.equal(sent.at(-1).context, analysisConsultation.context, "provider receives exact approved snapshot only");
    const sentCount = sent.length;
    await restricted.pool.query("UPDATE sbu_documents SET scan_generation='gen-b' WHERE id=$1", [documentId]);
    assert.equal((await call("owner-a", "/consultations", "POST", withAnalysis))[0], 409, "stale preview is rejected");
    const freshMessage = { ...message, revision: 1, requestId: randomUUID() };
    assert.equal((await call("owner-a", analysisPath + "/messages", "POST", freshMessage))[0], 409);
    assert.equal(sent.length, sentCount, "changed source must not reach provider");
    await restricted.pool.query("UPDATE sbu_documents SET scan_generation='gen-a' WHERE id=$1", [documentId]);
    for (const table of ["sbu_cases", "sbu_documents", "sbu_document_analyses"]) {
      const field = table === "sbu_cases" ? "101" : "$1";
      const params = table === "sbu_cases" ? [] : [table === "sbu_documents" ? documentId : analysisId];
      await restricted.pool.query(`UPDATE ${table} SET owner_id='owner-b' WHERE id=${field}`, params);
      assert.equal((await call("owner-a", previewPath))[0], 404, `${table} ownership is required`);
      assert.equal((await call("owner-a", analysisPath + "/messages", "POST", freshMessage))[0], 404);
      await restricted.pool.query(`UPDATE ${table} SET owner_id='owner-a' WHERE id=${field}`, params);
    }
    await restricted.pool.query("UPDATE sbu_document_analyses SET source_version=NULL WHERE id=$1", [analysisId]);
    assert.equal((await call("owner-a", previewPath))[0], 409, "legacy unversioned results cannot be linked");
    await restricted.pool.query("UPDATE sbu_document_analyses SET source_version=2 WHERE id=$1", [analysisId]);
    await restricted.pool.query("UPDATE sbu_documents SET version=3 WHERE id=$1", [documentId]);
    assert.equal((await call("owner-a", previewPath))[0], 409);
    await restricted.pool.query("UPDATE sbu_documents SET version=2,scan_status='infected' WHERE id=$1", [documentId]);
    assert.equal((await call("owner-a", previewPath))[0], 404);
    await restricted.pool.query("UPDATE sbu_documents SET scan_status='clean' WHERE id=$1", [documentId]);
    await restricted.pool.query("DELETE FROM sbu_document_analyses WHERE id=$1", [analysisId]);
    assert.equal((await call("owner-a", analysisPath + "/messages", "POST", freshMessage))[0], 404);
    assert.equal((await call("owner-a", analysisPath))[1].context, analysisConsultation.context, "deleting source does not rewrite snapshot");
    assert.equal(sent.length, sentCount);
    assert.equal((await restricted.pool.query("SELECT status FROM sbu_cases WHERE id=101")).rows[0].status, "draf");
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
