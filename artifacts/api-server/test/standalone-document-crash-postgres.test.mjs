import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, randomInt, createHash } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { PDFDocument } from "pdf-lib";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
const migration = name => readFile(new URL(`../../../lib/db/migrations/${name}.sql`, import.meta.url), "utf8");

async function bundleChild(temp) {
  const locks = (await readFile(join(dir, "../src/lib/document-lifecycle-lock.ts"), "utf8"))
    .replaceAll("(137, 1)", `(${randomInt(1_000_000, 2_000_000_000)}, 1)`);
  const child = join(dir, "helpers/document-crash-child.mjs");
  const outfile = join(temp, "child.mjs");
  await build({
    stdin: {
      contents: `import ${JSON.stringify(child)};
        import express from "express";
        const {default: router, runDocumentCleanup} = await import("crash-fixture-app");
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.log = {warn(){}}; next(); });
        app.post("/__fixture/cleanup", async (_req, res) => res.json(await runDocumentCleanup(false)));
        app.use("/api", router);
        const server = app.listen(0, "127.0.0.1", () =>
          process.send({type: "listening", port: server.address().port}));`,
      resolveDir: dir, loader: "js",
    },
    outfile, bundle: true, platform: "node", format: "esm",
    external: ["express", "@google-cloud/*", "drizzle-orm", "drizzle-orm/*"],
    plugins: [{
      name: "crash-isolation",
      setup(builder) {
        builder.onResolve({ filter: /^pg$/ }, () => ({ path: requireDb.resolve("pg"), external: true }));
        builder.onResolve({ filter: /^crash-fixture-app$/ }, () => ({ path: "app", namespace: "fixture" }));
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onResolve({ filter: /\/document-storage$/ }, () => ({ path: child }));
        builder.onResolve({ filter: /\/document-lifecycle-lock$/ }, () => ({ path: "locks", namespace: "fixture" }));
        builder.onResolve({ filter: /\/workspace-context$/ }, () => ({ path: join(dir, "helpers/workspace-context-fixture.mjs") }));
        builder.onResolve({ filter: /^\.\/document-analysis$/ }, args =>
          args.importer.endsWith("/routes/sbu.ts") ? { path: "analysis", namespace: "fixture" } : undefined);
        builder.onResolve({ filter: /^\.\/logger$/ }, () => ({ path: "logger", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents: {
            app: `export {default} from "../src/routes/sbu";
              export {runDocumentCleanup} from "../src/lib/document-cleanup-job";`,
            db: `import {drizzle} from "drizzle-orm/node-postgres";
              import {pool} from ${JSON.stringify(child)};
              export {pool};
              export * from "../../../lib/db/src/schema/index";
              export const db = drizzle(pool);`,
            auth: `export const getAuth = req => ({userId: req.get("x-test-user") ?? null});`,
            locks,
            logger: `export const logger = {info(){}, warn(){}};`,
            analysis: `import {createDocumentAnalysisRouter} from "../src/routes/document-analysis";
              import {generate} from ${JSON.stringify(child)};
              export default createDocumentAnalysisRouter(generate, async () => {});`,
          }[path], loader: "ts", resolveDir: dir,
        }));
      },
    }],
  });
  return outfile;
}

function startChild(file, config) {
  // No inherited application credentials, scanner configuration, or test-runner
  // context. Only the restricted fixture login crosses the IPC channel.
  const child = fork(file, [], { env: { NODE_ENV: "test" }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const messages = [];
  child.on("message", message => messages.push(message));
  let stderr = "";
  child.stderr.on("data", bytes => { stderr += bytes; });
  const exit = once(child, "exit");
  child.send(config);
  return {
    child, exit,
    async wait(type) {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const message = messages.find(message => message.type === type);
        if (message) return message;
        assert.equal(child.exitCode, null, `Fixture exited before ${type}: ${stderr}`);
        assert.equal(child.signalCode, null, `Fixture killed before ${type}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Fixture did not reach ${type}: ${stderr}`);
    },
    async kill() {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      return exit;
    },
  };
}

for (const [crashAt, initialScan] of [
  ["ready-update-held", "pending"],
  ["scan-held", "pending"], ["scan-update-held", "error"],
  ["concurrent", "pending"], ["concurrent", "error"],
]) {
  const concurrent = crashAt === "concurrent";
   test(crashAt === "ready-update-held"
     ? "SIGKILL before ready commit rolls back pending row and GC conditionally reclaims abandoned copies"
     : concurrent
    ? `two owner API processes serialize ${initialScan} document completion without rescanning`
    : `process crash at ${crashAt} preserves quarantined original and owner-only retry`, { timeout: 60_000 }, async () => {
    const temp = await mkdtemp(join(dir, ".document-crash-"));
    const objects = join(temp, "objects");
    await mkdir(objects);
    const admin = new Pool({ connectionString: process.env.DATABASE_URL });
    const bootstrap = await admin.connect();
    const schema = `document_crash_${randomUUID().replaceAll("-", "")}`;
    const children = [];
    let restricted, primaryError;
    try {
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      await bootstrap.query(`SET search_path TO "${schema}"`);
      await bootstrap.query("CREATE TABLE sbu_profiles (LIKE public.sbu_profiles INCLUDING ALL)");
      await bootstrap.query("CREATE TABLE sbu_cases (LIKE public.sbu_cases INCLUDING ALL)");
      await bootstrap.query(await migration("standalone-documents"));
      await bootstrap.query(await migration("document-malware"));
      await bootstrap.query(`ALTER TABLE sbu_documents ADD COLUMN category text NOT NULL DEFAULT 'lainnya',
        ADD COLUMN description text NOT NULL DEFAULT '', ADD COLUMN series_id uuid,
        ADD COLUMN version integer NOT NULL DEFAULT 1`);
      await bootstrap.query("CREATE TABLE sbu_document_analyses (LIKE public.sbu_document_analyses INCLUDING ALL)");
      await bootstrap.query(await migration("document-analysis-pages"));
      await bootstrap.query(await migration("document-analysis-operations"));
      await bootstrap.query("RESET search_path");
      restricted = await createRestrictedRoutePool(admin, schema);
      await restricted.pool.query("INSERT INTO sbu_profiles(user_id) VALUES ('crash-owner-a'), ('crash-owner-b')");
      // Explicit IDs avoid advancing copied defaults belonging to public.
      await restricted.pool.query(`INSERT INTO sbu_cases(id,owner_id,company_name,request_type,qualification,classification)
        VALUES (1,'crash-owner-a','Synthetic crash A','baru','kecil','konstruksi'),
        (2,'crash-owner-b','Synthetic crash B','baru','kecil','konstruksi')`);
      const pdf = await PDFDocument.create();
      pdf.addPage().drawText("SYNTHETIC_CRASH_ORIGINAL");
      const bytes = Array.from(await pdf.save());
      const file = await bundleChild(temp);
       const config = { database: { connectionString: restricted.pool.options.connectionString,
         options: `-c search_path=${schema}`, max: 2 }, objects, bytes, verdict: "clean",
         cleanupUsesMtime: crashAt === "ready-update-held" };
      const launch = async extra => {
        const applicationName = `document_fixture_${randomUUID()}`;
        const process = startChild(file, { ...config, ...extra,
          database: { ...config.database, application_name: applicationName } });
        children.push(process);
        const { port } = await process.wait("listening");
        return { process, port, applicationName };
      };
      let current = await launch(concurrent ? { pauseScan: true } : { crashAt });
      const call = async (method, path, user = "crash-owner-a", body, formOwner = user, target = current) => {
        const response = await fetch(`http://127.0.0.1:${target.port}${path}`, {
          method, signal: AbortSignal.timeout(15_000),
          headers: { ...(user ? { "x-test-user": user } : {}),
            ...(formOwner ? { "X-SBU-Form-Owner": formOwner } : {}), "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, type: response.headers.get("content-type"),
          bytes: Buffer.from(await response.arrayBuffer()) };
      };
      const calls = async () => (await readFile(join(objects, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
      const upload = await call("POST", "/api/cases/1/documents", undefined,
        { name: "synthetic.pdf", size: bytes.length, contentType: "application/pdf" });
      assert.equal(upload.status, 201);
      const id = JSON.parse(upload.bytes).document.id;
      const path = `/api/cases/1/documents/${id}`;
      if (initialScan === "error") {
        await restricted.pool.query("UPDATE sbu_documents SET scan_status='error' WHERE id=$1", [id]);
      }
      const state = async () => (await restricted.pool.query(
        "SELECT status,object_path,scan_status,scan_generation,scanned_at FROM sbu_documents WHERE id=$1", [id])).rows[0];
      const lockedState = { status: "ready", object_path: `/objects/documents/${id}`,
        scan_status: initialScan, scan_generation: null, scanned_at: null };
       if (crashAt === "ready-update-held") {
         const staging = (await restricted.pool.query(
           "SELECT object_path FROM sbu_documents WHERE id=$1", [id])).rows[0].object_path;
         const pendingState = { ...lockedState, status: "pending", object_path: staging };
         const original = join(objects, `_objects_documents_${id}`);
         const staged = join(objects, staging.replaceAll("/", "_"));
         const completing = call("POST", `${path}/complete`).then(
           result => ({ result }), error => ({ error }));
         await current.process.wait(crashAt);
         assert.deepEqual(await state(), pendingState, "uncommitted ready UPDATE is invisible");
         for (const object of [original, staged]) assert.deepEqual(await readFile(object), Buffer.from(bytes));
         assert.deepEqual((await calls()).map(c => c.op), ["reserve", "seal"],
           "crash is after the private copy, before staging removal or scanning");
         assert.deepEqual(await current.process.kill(), [null, "SIGKILL"]);
         assert.ok((await completing).error, "SIGKILL severs completion instead of handling an exception");
         current = await launch({ pauseGc: `/objects/documents/${id}` });
         assert.deepEqual(await state(), pendingState, "process death rolls ready UPDATE back to pending");

         const assertClosed = async () => {
           const before = await calls();
           const analysis = { consent: true, focus: "keuangan", pages: [1],
             sourceRevision: createHash("sha256").update(JSON.stringify([id, 1, "123"])).digest("hex") };
           for (const [method, suffix, body] of [
             ["GET", "/download"], ["GET", "/analysis-source"], ["POST", "/analyses", analysis],
           ]) {
             for (const [user, formOwner, expected] of [
               ["crash-owner-a", "crash-owner-a", 404], ["crash-owner-b", "crash-owner-b", 404],
               ["crash-owner-a", "crash-owner-b", 409], [null, null, 401],
             ]) assert.equal((await call(method, path + suffix, user, body, formOwner)).status, expected);
           }
           assert.deepEqual(await calls(), before, "pending or expired bytes never reach storage or AI");
         };
         const gc = async () => {
           const response = await call("POST", "/__fixture/cleanup");
           assert.equal(response.status, 200);
           const counts = JSON.parse(response.bytes);
           assert.equal(counts.skipped, undefined, "SIGKILL released the lifecycle lock");
           assert.equal(counts.failures, 0);
           assert.equal(counts.stopped, 0);
           return counts;
         };
         const age = new Date(Date.now() - 72 * 60 * 60_000);
         const ageRow = () => restricted.pool.query(
           "UPDATE sbu_documents SET created_at=$2 WHERE id=$1", [id, age]);
         await assertClosed();
         let counts = await gc();
         assert.equal(counts.scanned, 2);
         assert.equal(counts.deletedObjects, 0);
         assert.equal(counts.expiredReservations, 0);
         // Old provider metadata alone must not bypass a fresh pending row.
         await Promise.all([utimes(original, age, age), utimes(staged, age, age)]);
         counts = await gc();
         assert.equal(counts.deletedObjects, 0);
         assert.equal(counts.expiredReservations, 0);
         // Conversely, an expired reservation must retain a newly updated object.
         await ageRow();
         const fresh = new Date();
         await utimes(original, fresh, fresh);
         counts = await gc();
         assert.equal(counts.deletedObjects, 0);
         assert.equal(counts.expiredReservations, 0);
         assert.deepEqual(await state(), pendingState);
         for (const object of [original, staged]) assert.deepEqual(await readFile(object), Buffer.from(bytes));

         // Create an unrelated ready, clean document through the restarted API.
         const otherUpload = await call("POST", "/api/cases/2/documents", "crash-owner-b",
           { name: "ready-control.pdf", size: bytes.length, contentType: "application/pdf" });
         assert.equal(otherUpload.status, 201);
         const otherId = JSON.parse(otherUpload.bytes).document.id;
         const otherPath = `/api/cases/2/documents/${otherId}`;
         assert.equal((await call("POST", `${otherPath}/complete`, "crash-owner-b")).status, 200);
         const controlState = (await restricted.pool.query("SELECT * FROM sbu_documents WHERE id=$1", [otherId])).rows[0];
         const controlObject = join(objects, `_objects_documents_${otherId}`);
         await utimes(controlObject, age, age);
         await utimes(original, age, age);
         const generations = new Map(await Promise.all(
           [[staging, staged], [`/objects/documents/${id}`, original]].map(async ([path, file]) =>
             [path, String((await stat(file)).ino)])));

         // Change a provider generation after inspection but before DELETE.
         const cleaning = gc().then(result => ({ result }), error => ({ error }));
         await current.process.wait("gc-delete-held");
         const replacement = join(objects, "replacement");
         await writeFile(replacement, Buffer.from(bytes));
         await utimes(replacement, age, age);
         await rename(replacement, original);
         const replacementGeneration = String((await stat(original)).ino);
         assert.notEqual(replacementGeneration, generations.get(`/objects/documents/${id}`));
         current.process.child.send({ type: "release-gc-delete-held" });
         const refused = await cleaning;
         assert.ifError(refused.error);
         assert.equal(refused.result.deletedObjects, 1, "only the unchanged staging generation is deleted");
         assert.equal(refused.result.expiredReservations, 0, "generation conflict keeps the reservation for retry");
         assert.deepEqual(await state(), pendingState);
         assert.deepEqual(await readFile(original), Buffer.from(bytes));
         await assertClosed();
         const beforeRetry = await calls();
         assert.equal((await call("POST", `${path}/complete`)).status, 422,
           "expired reservation cannot adopt the surviving orphan");
         assert.deepEqual(await calls(), beforeRetry);

         counts = await gc();
         assert.equal(counts.deletedObjects, 1);
         assert.equal(counts.expiredReservations, 1);
         assert.equal(await state(), undefined);
         for (const object of [original, staged]) await assert.rejects(readFile(object), { code: "ENOENT" });
         await assertClosed();
         const operations = await calls();
         assert.deepEqual(operations.filter(c => c.op === "gc-remove"), [
           { op: "gc-remove", path: staging, generation: generations.get(staging) },
           { op: "gc-remove", path: `/objects/documents/${id}`, generation: generations.get(`/objects/documents/${id}`) },
           { op: "gc-remove", path: `/objects/documents/${id}`, generation: replacementGeneration },
         ]);
         assert.equal(operations.filter(c => c.op === "gc-generation-changed").length, 1);
         assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_documents WHERE id=$1", [otherId])).rows[0], controlState);
         assert.deepEqual(await readFile(controlObject), Buffer.from(bytes));
         const downloaded = await call("GET", `${otherPath}/download`, "crash-owner-b");
         assert.equal(downloaded.status, 200);
         assert.deepEqual(downloaded.bytes, Buffer.from(bytes));
         assert.equal((await call("GET", `${otherPath}/download`)).status, 404);
         counts = await gc();
         assert.equal(counts.deletedObjects, 0, "repeated GC is idempotent and retains ready control");
         assert.equal(counts.expiredReservations, 0);
         assert.equal((await restricted.pool.query("SELECT count(*)::int AS n FROM sbu_document_analyses")).rows[0].n, 0);
         return;
       }
      if (concurrent) {
        const first = current;
        const second = await launch({});
        // Attach both rejection handlers immediately, including on failure paths
        // where teardown kills a child with a request still in flight.
        const beginCompletion = target => {
          const pending = { settled: false };
          pending.result = call("POST", `${path}/complete`, "crash-owner-a", undefined,
            "crash-owner-a", target).then(
            result => ({ result }), error => ({ error }),
          ).finally(() => { pending.settled = true; });
          return pending;
        };
        const completing = beginCompletion(first);
        await first.process.wait("scan-held");
        const retry = beginCompletion(second);
        const assertWaitingOnRow = async () => {
          const deadline = Date.now() + 10_000;
          while (Date.now() < deadline) {
            const { rows } = await admin.query(`
              SELECT waiter.query, waiter.wait_event_type
              FROM pg_stat_activity waiter
              JOIN pg_stat_activity blocker ON blocker.pid = ANY(pg_blocking_pids(waiter.pid))
              WHERE waiter.application_name = $1 AND blocker.application_name = $2
                AND waiter.usename = $3 AND blocker.usename = $3
            `, [second.applicationName, first.applicationName,
              new URL(restricted.pool.options.connectionString).username]);
            if (rows.length) {
              assert.equal(rows[0].wait_event_type, "Lock");
              assert.match(rows[0].query, /from "sbu_documents".*for update/i,
                "retry must wait on the document row, not the shared advisory lock");
              assert.equal(completing.settled, false);
              assert.equal(retry.settled, false);
              return;
            }
            assert.equal(retry.settled, false, "retry finished instead of waiting for the row lock");
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          assert.fail("retry never waited on the first process's document row lock");
        };
        const analysis = { consent: true, focus: "keuangan", pages: [1],
          sourceRevision: createHash("sha256").update(JSON.stringify([id, 1, "123"])).digest("hex") };
        const assertQuarantined = async () => {
          assert.deepEqual(await state(), lockedState, "uncommitted scan must remain invisible");
          const before = await calls();
          for (const target of [first, second]) {
            for (const [method, suffix, body] of [
              ["GET", "/download"], ["GET", "/analysis-source"], ["POST", "/analyses", analysis],
            ]) {
              assert.equal((await call(method, path + suffix, "crash-owner-a", body,
                "crash-owner-a", target)).status, 404, "bytes stay private until the scan commits");
            }
          }
          assert.deepEqual(await calls(), before, "quarantine must not open storage or invoke AI");
          assert.equal(before.filter(c => c.op === "seal").length, 1, "only one private copy");
          assert.equal(before.filter(c => c.op === "scan").length, 1, "only the lock holder scans");
          assert.equal(before.filter(c => c.op === "remove").length, 1, "only one staging cleanup");
        };
        await assertWaitingOnRow();
        await assertQuarantined();
        first.process.child.send({ type: "release-scan-held" });
        await first.process.wait("scan-update-held");
        // The clean UPDATE has executed in PostgreSQL, but has not committed.
        // Neither another API nor an independent DB reader may see it yet.
        await assertWaitingOnRow();
        await assertQuarantined();
        first.process.child.send({ type: "release-scan-update-held" });
        const [completed, retried] = await Promise.all([completing.result, retry.result]);
        assert.ifError(completed.error);
        assert.ifError(retried.error);
        assert.equal(completed.result.status, 200);
        assert.equal(retried.result.status, 200);
        const response = JSON.parse(completed.result.bytes);
        assert.deepEqual(JSON.parse(retried.result.bytes), response, "both sessions see the same clean document");
        assert.equal(response.id, id);
        assert.equal(response.scanStatus, "clean");
        const finalState = await state();
        assert.deepEqual(finalState, { ...lockedState, scan_status: "clean",
          scan_generation: "123", scanned_at: finalState.scanned_at });
        assert.ok(finalState.scanned_at instanceof Date);
        for (const target of [first, second]) {
          const downloaded = await call("GET", `${path}/download`, "crash-owner-a", undefined,
            "crash-owner-a", target);
          assert.equal(downloaded.status, 200);
          assert.deepEqual(downloaded.bytes, Buffer.from(bytes));
          assert.equal((await call("GET", `${path}/download`, "crash-owner-b", undefined,
            "crash-owner-b", target)).status, 404);
        }
        const operations = await calls();
        assert.equal(operations.filter(c => c.op === "seal").length, 1);
        assert.equal(operations.filter(c => c.op === "scan").length, 1, "retry reuses the committed clean result");
        assert.deepEqual(operations.filter(c => c.op === "file").map(c => c.generation), ["123", "123"]);
        assert.deepEqual(await readFile(join(objects, `_objects_documents_${id}`)), Buffer.from(bytes));
        assert.equal((await restricted.pool.query("SELECT count(*)::int AS n FROM sbu_document_analyses")).rows[0].n, 0);
        return;
      }
      // Attach rejection handling immediately: SIGKILL must sever the HTTP
      // response, rather than the route returning a handled storage failure.
      const completing = call("POST", `${path}/complete`).then(
        result => ({ result }), error => ({ error }));
      await current.process.wait(crashAt);
      assert.deepEqual(await state(), lockedState, "private-copy transaction committed before the fault");
      const original = join(objects, `_objects_documents_${id}`);
      assert.deepEqual(await readFile(original), Buffer.from(bytes));
      assert.deepEqual(await current.process.kill(), [null, "SIGKILL"]);
      assert.ok((await completing).error, "API died without a completion response");
      current = await launch({ verdict: "error" });
      assert.deepEqual(await state(), lockedState, "uncommitted scan result rolled back after process death");
      // Make the reference and object eligible by age, so a broken GC status
      // predicate really would remove the original.
      await restricted.pool.query("UPDATE sbu_documents SET created_at=now()-interval '72 hours' WHERE id=$1", [id]);
      const cleaned = await call("POST", "/__fixture/cleanup");
      assert.equal(cleaned.status, 200);
      const counts = JSON.parse(cleaned.bytes);
      assert.equal(counts.skipped, undefined, "crash releases lifecycle lock and GC actually runs");
      assert.equal(counts.scanned, 1);
      assert.equal(counts.deletedObjects, 0);
      assert.equal(counts.expiredReservations, 0);
      assert.equal(counts.failures, 0);
      assert.deepEqual(await state(), lockedState);
      assert.deepEqual(await readFile(original), Buffer.from(bytes));

      const analysis = { consent: true, focus: "keuangan", pages: [1],
        sourceRevision: createHash("sha256").update(JSON.stringify([id, 1, "123"])).digest("hex") };
      const assertLocked = async () => {
        const before = await calls();
        for (const [method, suffix, body] of [
          ["GET", "/download"], ["GET", "/analysis-source"], ["POST", "/analyses", analysis],
        ]) {
          for (const [user, formOwner, expected] of [
            ["crash-owner-a", "crash-owner-a", 404], ["crash-owner-b", "crash-owner-b", 404],
            ["crash-owner-a", "crash-owner-b", 409], ["crash-owner-a", null, 409],
            ["crash-owner-b", "crash-owner-a", 409], [null, null, 401],
          ]) assert.equal((await call(method, path + suffix, user, body, formOwner)).status, expected);
        }
        for (const [user, formOwner, expected] of [
          ["crash-owner-b", "crash-owner-b", 404], ["crash-owner-a", "crash-owner-b", 409],
          ["crash-owner-b", "crash-owner-a", 409], ["crash-owner-a", null, 409], [null, null, 401],
        ]) assert.equal((await call("POST", `${path}/complete`, user, undefined, formOwner)).status, expected);
        assert.deepEqual(await calls(), before, "blocked requests never touch storage, scanner, or AI");
      };
      await assertLocked();
      const retry = await call("POST", `${path}/complete`);
      assert.equal(retry.status, 200);
      assert.equal(JSON.parse(retry.bytes).scanStatus, "error");
      assert.equal((await calls()).filter(c => c.op === "seal").length, 1, "owner retry does not recopy old upload");
      assert.equal((await calls()).filter(c => c.op === "scan").length, 2);
      await assertLocked();
      await current.process.kill();
      current = await launch({});
      assert.equal((await state()).scan_status, "error", "error quarantine survives another fresh process");
      await assertLocked();
      const recovered = await call("POST", `${path}/complete`);
      assert.equal(recovered.status, 200);
      assert.equal(JSON.parse(recovered.bytes).scanStatus, "clean");
      assert.equal((await calls()).filter(c => c.op === "seal").length, 1);
      assert.equal((await calls()).filter(c => c.op === "scan").length, 3);
      const downloaded = await call("GET", `${path}/download`);
      assert.equal(downloaded.status, 200);
      assert.deepEqual(downloaded.bytes, Buffer.from(bytes));
      assert.deepEqual((await calls()).filter(c => c.op === "file").map(c => c.generation), ["123"]);
      assert.equal((await call("GET", `${path}/download`, "crash-owner-b")).status, 404);
      assert.equal((await call("POST", `${path}/complete`, "crash-owner-a", undefined, "crash-owner-b")).status, 409);
      assert.equal((await restricted.pool.query("SELECT count(*)::int AS n FROM sbu_document_analyses")).rows[0].n, 0);
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      // Attempt every release even if one cleanup fails; never leave a child
      // holding a transaction while dropping its isolated schema/login.
      const errors = [];
      const cleanup = async fn => { try { await fn(); } catch (error) { errors.push(error); } };
      for (const child of children) await cleanup(() => child.kill());
      if (restricted) await cleanup(() => restricted.close());
      await cleanup(() => bootstrap.query("RESET search_path"));
      await cleanup(() => bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
      bootstrap.release();
      await cleanup(() => admin.end());
      await cleanup(() => rm(temp, { recursive: true, force: true }));
      if (errors.length) throw new AggregateError(
        primaryError ? [primaryError, ...errors] : errors,
        "Synthetic crash fixture cleanup failed",
        primaryError ? { cause: primaryError } : undefined,
      );
    }
  });
}
