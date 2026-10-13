import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".document-cleanup-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  entryPoints: [join(dir, "../src/lib/document-cleanup.ts")], outfile: join(temp, "core.mjs"),
  bundle: true, platform: "node", format: "esm", external: ["pdf-lib"],
});
const { reconcileDocuments, isManagedDocumentPath } = await import(join(temp, "core.mjs"));
const now = Date.now();
const old = now - 49 * 60 * 60_000;
const stage = (id = randomUUID()) => `/objects/uploads/${id}`;
const final = (id) => `/objects/documents/${id}`;
const pending = () => ({ id: randomUUID(), status: "pending", objectPath: stage(), createdAt: new Date(old) });
const object = (path, updatedAt = old, generation = "1") => ({ path, updatedAt, generation });
function fixture(objects = []) {
  const files = new Map(objects.map((o) => [o.path, o]));
  const deleted = [];
  const expired = [];
  const storage = {
    inspect: async (path) => files.get(path),
    removeGeneration: async (o) => {
      const current = files.get(o.path);
      if (current && current.generation !== o.generation) return false;
      files.delete(o.path);
      deleted.push(o.path);
      return true;
    },
  };
  return { files, deleted, expired, storage, expire: async (id) => { expired.push(id); } };
}

test("grace exceeds actual signed PUT lifetime and the application completion window", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(join(dir, "../src/lib/objectStorage.ts"), "utf8");
  const validation = await readFile(join(dir, "../src/lib/document-validation.ts"), "utf8");
  assert.match(source, /ttlSec: 900/);
  assert.match(validation, /DOCUMENT_COMPLETION_WINDOW_MS = 30 \* 60_000/);
  assert.match(validation, /DOCUMENT_CLEANUP_GRACE_MS = 48 \* 60 \* 60_000/);
  assert.ok(48 * 60 * 60_000 > 900_000 + 30 * 60_000);
});

test("crash before metadata or after final copy, abandoned reservations, and replayed staging are reclaimed", async () => {
  const abandoned = pending(), copied = pending(), empty = pending();
  const ready = { ...pending(), status: "ready" };
  ready.objectPath = final(ready.id);
  const readyBytes = object(ready.objectPath);
  const f = fixture([
    object(stage()), // crash after issuing URL, before inserting reservation
    object(abandoned.objectPath),
    object(copied.objectPath), object(final(copied.id)), // copy before DB rollback/crash
    object(stage()), // replay after normal document deletion
    object(stage()), // replay after normal ready-stage cleanup
    readyBytes,
  ]);
  const result = await reconcileDocuments([abandoned, copied, empty, ready], [...f.files.values()],
    f.storage, f.expire, { dryRun: false, now });
  assert.equal(result.deletedObjects, 6);
  assert.equal(result.expiredReservations, 3);
  assert.deepEqual(f.files.get(ready.objectPath), readyBytes);
  assert.equal(f.files.size, 1);
  assert.ok(!f.expired.includes(ready.id));
  // A repeated pass is idempotent.
  const again = await reconcileDocuments([ready], [...f.files.values()], f.storage, f.expire, { dryRun: false, now });
  assert.equal(again.deletedObjects, 0);
});

test("dry-run inspects candidates but never writes storage or metadata, including missing uploads", async () => {
  const row = pending(), empty = pending();
  const f = fixture([object(row.objectPath), object(final(row.id)), object(stage())]);
  const result = await reconcileDocuments([row, empty], [...f.files.values()], f.storage, f.expire, { dryRun: true, now });
  assert.equal(result.candidates, 3);
  assert.equal(result.reservationCandidates, 2);
  assert.equal(result.deletedObjects, 0);
  assert.equal(result.expiredReservations, 0);
  assert.equal(f.files.size, 3);
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(f.expired, []);
});

test("active/new uploads and recent replay generations outlive old reservation timestamps", async () => {
  const active = { ...pending(), createdAt: new Date(now) }, replay = pending(), finalInProgress = pending();
  const f = fixture([object(active.objectPath), object(replay.objectPath, now),
    object(final(finalInProgress.id), now), object(stage(), now)]);
  const result = await reconcileDocuments([active, replay, finalInProgress], [...f.files.values()],
    f.storage, f.expire, { dryRun: false, now });
  assert.equal(result.deletedObjects, 0);
  assert.equal(result.expiredReservations, 0);
  assert.equal(f.files.size, 4);
});

test("all ready references, conflicting references, unknown namespaces/status and invalid ages are retained", async () => {
  const row = pending();
  const ready = { ...pending(), status: "ready", objectPath: row.objectPath };
  const unknown = { ...pending(), status: "unknown" };
  const alien = { ...pending(), objectPath: "/objects/public/other" };
  const f = fixture([object(row.objectPath), object(final(row.id)), object(final(ready.id)),
    object(unknown.objectPath), object(final(unknown.id)), object(alien.objectPath), object(stage(), NaN),
    object(stage(), old, "")]);
  const result = await reconcileDocuments([row, ready, unknown, alien], [...f.files.values()],
    f.storage, f.expire, { dryRun: false, now });
  assert.equal(result.deletedObjects, 0);
  assert.equal(result.expiredReservations, 0);
  assert.equal(isManagedDocumentPath("/objects/uploads/not-a-document"), false);
});

test("conditional generation deletion detects concurrent PUT replay and preserves reservation", async () => {
  const row = pending();
  const f = fixture([object(row.objectPath)]);
  const remove = f.storage.removeGeneration;
  f.storage.removeGeneration = async (snapshot) => {
    f.files.set(snapshot.path, object(snapshot.path, now, "2"));
    return remove(snapshot);
  };
  const result = await reconcileDocuments([row], [...f.files.values()], f.storage, f.expire, { dryRun: false, now });
  assert.equal(result.deletedObjects, 0);
  assert.equal(result.expiredReservations, 0);
  assert.equal(f.files.get(row.objectPath).generation, "2");
});

test("storage errors do not expire reservations, leak error details, or stop other candidates", async () => {
  const row = pending();
  const orphan = object(stage());
  const f = fixture([object(row.objectPath), orphan]);
  f.storage.inspect = async () => { throw new Error("private-name token signed-url contents user"); };
  const result = await reconcileDocuments([row], [...f.files.values()], f.storage, f.expire, { dryRun: false, now });
  assert.equal(result.failures, 1);
  assert.equal(result.deletedObjects, 1);
  assert.equal(result.expiredReservations, 0);
  assert.ok(Object.values(result).every((v) => typeof v === "number"));
  assert.equal(f.files.has(row.objectPath), true);
});

test("bounded reservation batches rotate past retained uploads instead of starving later reservations", async () => {
  const rows = Array.from({ length: 205 }, pending).sort((a, b) => a.id.localeCompare(b.id));
  const f = fixture(rows.slice(0, 200).map((r) => object(r.objectPath, now)));
  await reconcileDocuments(rows, [], f.storage, f.expire, { dryRun: false, now });
  assert.equal(f.expired.length, 0);
  await reconcileDocuments(rows, [], f.storage, f.expire, { dryRun: false, now, reservationOffset: 200 });
  assert.deepEqual(new Set(f.expired), new Set(rows.slice(200).map((r) => r.id)));
});

test("real storage adapter scopes listing, pins deletion generation, and rejects unsafe paths", async () => {
  const calls = [];
  const path = stage();
  globalThis.__cleanupBucket = {
    getFiles: async (options) => {
      calls.push(options);
      return [[
        { name: `private/${path.slice(9)}`, metadata: { generation: "12345678901234567",
          timeCreated: new Date(old).toISOString(), updated: new Date(now).toISOString() } },
        { name: "private/uploads/unmanaged", metadata: {} },
      ], { pageToken: "page-2" }];
    },
    file: (name) => ({
      getMetadata: async () => [{ generation: "12345678901234567", updated: new Date(old).toISOString(),
        timeCreated: new Date(old).toISOString() }],
      delete: async (options) => { calls.push({ name, ...options }); if (globalThis.__cleanupDeleteError) throw globalThis.__cleanupDeleteError; },
    }),
  };
  await build({
    entryPoints: [join(dir, "../src/lib/document-storage.ts")], outfile: join(temp, "adapter.mjs"),
    bundle: true, platform: "node", format: "esm", external: ["pdf-lib", "pino"],
    plugins: [{
      name: "cleanup-storage-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/objectStorage$/ }, () => ({ path: "storage", namespace: "fixture" }));
        builder.onResolve({ filter: /^\.\/objectAcl$/ }, () => ({ path: "acl", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents: path === "acl" ? "export const setObjectAclPolicy = async () => {};" : `
            export class ObjectNotFoundError extends Error {}
            export class ObjectStorageService {
              getPrivateObjectDir() { return "/synthetic-bucket/private"; }
            }
            export const objectStorageClient = {bucket:()=>globalThis.__cleanupBucket};
          `, loader: "ts", resolveDir: dir,
        }));
      },
    }],
  });
  const { documentStorage } = await import(join(temp, "adapter.mjs"));
  const page = await documentStorage.listCleanupObjects({ namespace: "uploads" });
  assert.equal(page.objects.length, 1);
  assert.equal(page.objects[0].path, path);
  assert.equal(page.objects[0].updatedAt, now);
  assert.deepEqual(page.nextCursor, { namespace: "uploads", pageToken: "page-2" });
  assert.equal(calls[0].prefix, "private/uploads/");
  assert.equal(calls[0].autoPaginate, false);
  const snapshot = await documentStorage.inspect(path);
  assert.equal(await documentStorage.removeGeneration(snapshot), true);
  assert.equal(calls[1].ifGenerationMatch, "12345678901234567");
  globalThis.__cleanupDeleteError = { code: 412 };
  assert.equal(await documentStorage.removeGeneration(snapshot), false);
  globalThis.__cleanupDeleteError = { code: 404 };
  assert.equal(await documentStorage.removeGeneration(snapshot), true);
  globalThis.__cleanupDeleteError = { code: 403 };
  await assert.rejects(documentStorage.removeGeneration(snapshot));
  await assert.rejects(documentStorage.inspect("/objects/public/asset"));
  await assert.rejects(documentStorage.removeGeneration({ ...snapshot, generation: "" }));
  delete globalThis.__cleanupDeleteError;
  delete globalThis.__cleanupBucket;
});

test("scheduled job uses PostgreSQL transaction exclusion across uploads, crashes, and parallel cleaners", async () => {
  const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
  const { Pool } = requireDb("pg");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `cleanup_${randomUUID().replaceAll("-", "")}`;
  let restricted;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".sbu_documents (
      id uuid PRIMARY KEY, status text NOT NULL, object_path text NOT NULL, created_at timestamptz NOT NULL)`);
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__cleanupPool = restricted.pool;
    const row = pending();
    const ready = { ...pending(), status: "ready" };
    ready.objectPath = final(ready.id);
    for (const r of [row, ready]) await restricted.pool.query(
      "INSERT INTO sbu_documents VALUES ($1,$2,$3,$4)", [r.id, r.status, r.objectPath, r.createdAt]);
    const f = fixture([object(row.objectPath), object(final(row.id)), object(ready.objectPath), object(stage())]);
    let listCalls = 0;
    globalThis.__cleanupStorage = {
      ...f.storage,
      listCleanupObjects: async () => {
        listCalls++;
        return { objects: [...f.files.values()], nextCursor: { namespace: "uploads" } };
      },
    };
    globalThis.__cleanupLogs = [];
    await build({
      stdin: {
        contents: `export * from "../src/lib/document-cleanup-job";
          export * from "../src/lib/document-lifecycle-lock";`,
        resolveDir: dir, loader: "ts",
      },
      outfile: join(temp, "job.mjs"), bundle: true, platform: "node", format: "esm",
      external: ["drizzle-orm", "drizzle-orm/*", "pdf-lib"],
      plugins: [{
        name: "cleanup-job-fixture",
        setup(builder) {
          builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
          builder.onResolve({ filter: /^\.\/document-storage$/ }, () => ({ path: "storage", namespace: "fixture" }));
          builder.onResolve({ filter: /^\.\/logger$/ }, () => ({ path: "logger", namespace: "fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: path === "db" ? `
              import {drizzle} from "drizzle-orm/node-postgres";
              export {documentsTable} from ${JSON.stringify(join(dir, "../../../lib/db/src/schema/standalone.ts"))};
              export const db = drizzle(globalThis.__cleanupPool);
            ` : path === "storage" ? `export const documentStorage = globalThis.__cleanupStorage;` :
              `export const logger = {info: (counts)=>globalThis.__cleanupLogs.push(counts),
                warn: (counts)=>globalThis.__cleanupLogs.push(counts)};`,
            loader: "ts", resolveDir: dir,
          }));
        },
      }],
    });
    const { runDocumentCleanup, documentActivityLock, documentCleanupLock, startDocumentCleanup } = await import(join(temp, "job.mjs"));
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialect = new PgDialect();
    const shared = dialect.sqlToQuery(documentActivityLock);
    const exclusive = dialect.sqlToQuery(documentCleanupLock);
    // One read-only lock probe on the admin pool leaves a connection available
    // in the two-slot restricted pool for the actual job transaction.
    const first = await admin.connect(), second = await restricted.pool.connect();
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      await first.query(shared.sql, shared.params);
      await second.query(shared.sql, shared.params); // two uploads coexist
      assert.deepEqual(await runDocumentCleanup(false), { skipped: 1 });
      assert.equal(listCalls, 0);
      await first.query("ROLLBACK"); // crashed transaction releases lock
      assert.deepEqual(await runDocumentCleanup(false), { skipped: 1 });
      await second.query("ROLLBACK");
      await first.query("BEGIN");
      const lock = await first.query(exclusive.sql, exclusive.params);
      assert.equal(lock.rows[0].acquired, true);
      assert.deepEqual(await runDocumentCleanup(false), { skipped: 1 }); // second cleaner excluded
      // API writes block until the cleanup transaction ends.
      let acquired = false;
      await second.query("BEGIN");
      const blocked = second.query(shared.sql, shared.params).then(() => { acquired = true; });
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(acquired, false);
      await first.query("ROLLBACK");
      await blocked;
      await second.query("ROLLBACK");
    } finally {
      await first.query("ROLLBACK"); await second.query("ROLLBACK");
      first.release(); second.release();
    }
    const dry = await runDocumentCleanup(true);
    assert.equal(dry.candidates, 3);
    assert.equal(f.files.size, 4);
    assert.equal((await restricted.pool.query("SELECT count(*)::int AS n FROM sbu_documents")).rows[0].n, 2);
    const applied = await runDocumentCleanup(false);
    assert.equal(applied.deletedObjects, 3);
    assert.equal(applied.expiredReservations, 1);
    assert.equal(f.files.size, 1);
    assert.equal(f.files.has(ready.objectPath), true);
    assert.deepEqual((await restricted.pool.query("SELECT id,status,object_path FROM sbu_documents")).rows,
      [{ id: ready.id, status: "ready", object_path: ready.objectPath }]);
    assert.equal((await runDocumentCleanup(false)).deletedObjects, 0);
    // DB read failure fails closed BEFORE listing/deletion.
    await admin.query(`ALTER TABLE "${schema}".sbu_documents RENAME TO hidden_documents`);
    const before = listCalls;
    await assert.rejects(runDocumentCleanup(false));
    assert.equal(listCalls, before);
    // Scheduler logs strictly numeric counts, not thrown private details.
    const previous = process.env.SBU_DOCUMENT_CLEANUP_MODE;
    process.env.SBU_DOCUMENT_CLEANUP_MODE = "dry-run";
    const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
    let intervalMs, scheduled, cleared = false;
    globalThis.setInterval = (fn, ms) => {
      scheduled = fn; intervalMs = ms; return { unref() {} };
    };
    globalThis.clearInterval = () => { cleared = true; };
    const stop = startDocumentCleanup();
    try {
      for (let i = 0; i < 50 && !globalThis.__cleanupLogs.length; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(globalThis.__cleanupLogs, [{ failures: 1 }]);
      assert.equal(intervalMs, 60 * 60_000);
      // The next scheduled invocation retries after a failed run.
      scheduled();
      for (let i = 0; i < 50 && globalThis.__cleanupLogs.length < 2; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(globalThis.__cleanupLogs, [{ failures: 1 }, { failures: 1 }]);
    } finally {
      stop();
      assert.equal(cleared, true);
      globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear;
      if (previous === undefined) delete process.env.SBU_DOCUMENT_CLEANUP_MODE;
      else process.env.SBU_DOCUMENT_CLEANUP_MODE = previous;
    }
  } finally {
    if (restricted) await restricted.close();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    delete globalThis.__cleanupPool;
    delete globalThis.__cleanupStorage;
    delete globalThis.__cleanupLogs;
  }
});
