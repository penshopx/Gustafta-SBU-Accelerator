import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, randomInt, createHash } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
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

for (const [crashAt, initialScan] of [["scan-held", "pending"], ["scan-update-held", "error"]]) {
  test(`process crash at ${crashAt} preserves quarantined original and owner-only retry`, { timeout: 60_000 }, async () => {
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
        options: `-c search_path=${schema}`, max: 2 }, objects, bytes, verdict: "clean" };
      const launch = async extra => {
        const process = startChild(file, { ...config, ...extra });
        children.push(process);
        const { port } = await process.wait("listening");
        return { process, port };
      };
      let current = await launch({ crashAt });
      const call = async (method, path, user = "crash-owner-a", body, formOwner = user) => {
        const response = await fetch(`http://127.0.0.1:${current.port}${path}`, {
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
