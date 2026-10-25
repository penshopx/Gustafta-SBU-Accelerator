import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".document-cleanup-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: { contents: `export * from "../src/lib/document-cleanup";
    export * from "../src/lib/document-cleanup-budget";`, resolveDir: dir, loader: "ts" },
  outfile: join(temp, "core.mjs"),
  bundle: true, platform: "node", format: "esm", external: ["pdf-lib"],
});
const { reconcileDocuments, isManagedDocumentPath, CleanupBudget, CleanupStopped } = await import(join(temp, "core.mjs"));
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

test("operation budget stops before starting another call and leaves partial reservations retryable", async () => {
  const row = pending();
  const f = fixture([object(row.objectPath), object(final(row.id)), object(stage())]);
  const result = await reconcileDocuments([row], [...f.files.values()], f.storage, f.expire, {
    dryRun: false, now, budget: new CleanupBudget({ maxOperations: 3 }),
  });
  assert.equal(result.stopped, 1);
  assert.equal(result.timeouts, 0);
  assert.equal(result.operations, 3); // two inspections, then one deletion
  assert.equal(result.deletedObjects, 1);
  assert.deepEqual(f.expired, []);
  assert.equal(f.files.has(final(row.id)), true);
  const retry = await reconcileDocuments([row], [...f.files.values()], f.storage, f.expire, { dryRun: false, now });
  assert.equal(retry.expiredReservations, 1);
  assert.equal(f.files.size, 0);
});

test("round deadline also bounds a call whose individual timeout is longer", async () => {
  const budget = new CleanupBudget({ roundMs: 25, operationMs: 10_000 });
  const start = performance.now();
  await assert.rejects(budget.run(() => new Promise(() => {})), CleanupStopped);
  assert.ok(performance.now() - start < 1_000);
  let invoked = false;
  await assert.rejects(budget.run(async () => { invoked = true; }), CleanupStopped);
  assert.equal(invoked, false);
  assert.equal(budget.timeouts, 1);
  for (const invalid of [0, -1, NaN, Infinity, 1.5]) {
    assert.throws(() => new CleanupBudget({ roundMs: invalid }));
    assert.throws(() => new CleanupBudget({ operationMs: invalid }));
    assert.throws(() => new CleanupBudget({ maxOperations: invalid }));
  }
});

test("timed-out inspect stops the entire round, even in dry-run, and ignores late success or rejection", async () => {
  for (const dryRun of [false, true]) {
    for (const rejectLate of [false, true]) {
      const row = pending();
      const f = fixture([object(row.objectPath), object(stage())]);
      let settle, calls = 0;
      f.storage.inspect = () => {
        calls++;
        return new Promise((resolve, reject) => {
          settle = () => rejectLate ? reject(new Error("private signed-url")) : resolve(object(row.objectPath));
        });
      };
      const result = await reconcileDocuments([row], [...f.files.values()], f.storage, f.expire, {
        dryRun, now, budget: new CleanupBudget({ operationMs: 25 }),
      });
      assert.equal(result.stopped, 1);
      assert.equal(result.timeouts, 1);
      assert.equal(calls, 1); // no parallel inspect and no orphan deletes
      const snapshot = { ...result };
      settle();
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(result, snapshot);
      assert.equal(calls, 1);
      assert.deepEqual(f.expired, []);
      assert.deepEqual(f.deleted, []);
      assert.ok(Object.values(result).every((v) => typeof v === "number"));
    }
  }
});

test("late conditional delete never expires metadata or deletes a replay generation or ready document", async () => {
  for (const replay of [false, true]) {
    const row = pending();
    const ready = { ...pending(), status: "ready" };
    ready.objectPath = final(ready.id);
    const f = fixture([object(row.objectPath), object(final(row.id)), object(ready.objectPath), object(stage())]);
    const remove = f.storage.removeGeneration;
    let settle;
    f.storage.removeGeneration = (snapshot) => new Promise((resolve) => {
      settle = async () => resolve(await remove(snapshot));
    });
    const result = await reconcileDocuments([row, ready], [...f.files.values()], f.storage, f.expire, {
      dryRun: false, now, budget: new CleanupBudget({ operationMs: 25 }),
    });
    assert.equal(result.stopped, 1);
    assert.equal(result.timeouts, 1);
    assert.equal(result.deletedObjects, 0); // provider outcome is unknown
    const snapshot = { ...result };
    if (replay) f.files.set(row.objectPath, object(row.objectPath, now, "2"));
    await settle();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(result, snapshot);
    assert.deepEqual(f.expired, []);
    assert.equal(f.files.has(final(row.id)), true); // no continuation to second delete
    assert.equal(f.files.has(ready.objectPath), true);
    assert.equal(f.files.has(row.objectPath), replay);
    f.storage.removeGeneration = remove;
    const retry = await reconcileDocuments([row, ready], [...f.files.values()], f.storage, f.expire, { dryRun: false, now });
    assert.equal(retry.expiredReservations, replay ? 0 : 1);
    assert.equal(f.files.has(ready.objectPath), true);
  }
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

test("paged job reaches both namespace tails after dry-run, restart, rejected tokens, failed snapshots and behind-cursor inserts", async () => {
  const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
  const { Pool } = requireDb("pg");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `cleanup_pages_${randomUUID().replaceAll("-", "")}`;
  let restricted;
  const files = new Map(), deleted = [], listings = [], rows = [];
  const expectedKept = new Map(), oldOrphans = [];
  // Stable UUID order, with protected references AND old orphans on every page.
  // Tokens are keyset-based, not offsets: deleting a page must not shift the
  // remaining objects backwards and accidentally make this fixture skip them.
  const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  for (const namespace of ["uploads", "documents"]) {
    for (let i = 1; i <= 2403; i++) {
      const id = uuid(i + (namespace === "documents" ? 10000 : 0));
      const path = `/objects/${namespace}/${id}`;
      const ready = i % 1000 === 2 || i === 2402;
      const orphan = i % 1000 === 1 || i === 2403;
      const entry = object(path, ready || orphan ? old : now);
      files.set(path, entry);
      if (orphan) oldOrphans.push(path);
      else expectedKept.set(path, { ...entry });
      if (ready) rows.push({ id, status: "ready", objectPath: path, createdAt: new Date(old) });
    }
  }
  // Old pending data proves failed listings never reach reservation cleanup.
  const abandoned = pending();
  rows.push(abandoned);
  files.set(abandoned.objectPath, object(abandoned.objectPath));
  let epoch = 1, listError;
  const bucket = {
    getFiles: async (options) => {
      listings.push({ ...options });
      assert.equal(options.autoPaginate, false);
      assert.equal(options.maxResults, 1000);
      assert.match(options.prefix, /^private\/(uploads|documents)\/$/);
      if (listError) throw listError;
      let last = "";
      if (options.pageToken) {
        const [version, name] = JSON.parse(options.pageToken);
        if (version !== epoch) throw Object.assign(new Error("expired synthetic token"), { code: 400 });
        last = name;
      }
      const matching = [...files.values()]
        .map((entry) => ({ entry, name: `private/${entry.path.slice("/objects/".length)}` }))
        .filter(({ name }) => name.startsWith(options.prefix) && name > last)
        .sort((a, b) => a.name.localeCompare(b.name));
      const page = matching.slice(0, options.maxResults);
      const next = matching.length > page.length
        ? { pageToken: JSON.stringify([epoch, page.at(-1).name]) } : null;
      return [page.map(({ name, entry }) => ({ name, metadata: {
        generation: entry.generation, updated: new Date(entry.updatedAt).toISOString(),
        timeCreated: new Date(entry.updatedAt).toISOString(),
      } })), next];
    },
    file: (name) => ({
      getMetadata: async () => { throw new Error("Unexpected inspect in paged fixture"); },
      delete: async ({ ifGenerationMatch }) => {
        const path = `/objects/${name.slice("private/".length)}`;
        const entry = files.get(path);
        assert.ok(entry, "delete targets an existing synthetic object");
        assert.equal(ifGenerationMatch, entry.generation);
        assert.ok(entry.updatedAt === old);
        assert.ok(!expectedKept.has(path), "no young or referenced ready object may be deleted");
        files.delete(path);
        deleted.push(path);
      },
    }),
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".sbu_documents (
      id uuid PRIMARY KEY, status text NOT NULL, object_path text NOT NULL, created_at timestamptz NOT NULL)`);
    restricted = await createRestrictedRoutePool(admin, schema);
    for (const r of rows) await restricted.pool.query("INSERT INTO sbu_documents VALUES ($1,$2,$3,$4)",
      [r.id, r.status, r.objectPath, r.createdAt]);
    const productionLocks = await readFile(join(dir, "../src/lib/document-lifecycle-lock.ts"), "utf8");
    const fixtureLocks = productionLocks.replaceAll("(137, 1)", `(${randomInt(1_000_000, 2_000_000_000)}, 1)`);
    assert.notEqual(fixtureLocks, productionLocks);
    globalThis.__pagedCleanupPool = restricted.pool;
    globalThis.__pagedCleanupBucket = bucket;
    const output = join(temp, "paged-job.mjs");
    await build({
      entryPoints: [join(dir, "../src/lib/document-cleanup-job.ts")], outfile: output,
      bundle: true, platform: "node", format: "esm", external: ["drizzle-orm", "drizzle-orm/*", "pdf-lib", "pino"],
      plugins: [{
        name: "paged-cleanup-fixture",
        setup(builder) {
          for (const [filter, path] of [
            [/^@workspace\/db$/, "db"], [/^\.\/objectStorage$/, "storage"],
            [/^\.\/objectAcl$/, "acl"], [/^\.\/logger$/, "logger"],
            [/^\.\/document-lifecycle-lock$/, "locks"],
          ]) builder.onResolve({ filter }, () => ({ path, namespace: "paged-fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "paged-fixture" }, ({ path }) => ({
            contents: path === "db" ? `
              import {drizzle} from "drizzle-orm/node-postgres";
              export {documentsTable} from ${JSON.stringify(join(dir, "../../../lib/db/src/schema/standalone.ts"))};
              export const db = drizzle(globalThis.__pagedCleanupPool);
            ` : path === "storage" ? `
              export class ObjectNotFoundError extends Error {}
              export class ObjectStorageService {
                getPrivateObjectDir() { return "/synthetic-bucket/private"; }
              }
              export const objectStorageClient = {bucket:()=>globalThis.__pagedCleanupBucket};
            ` : path === "acl" ? "export const setObjectAclPolicy = async () => {};"
              : path === "locks" ? fixtureLocks : "export const logger = {info(){},warn(){}};",
            loader: "ts", resolveDir: dir,
          }));
        },
      }],
    });
    let { runDocumentCleanup: run } = await import(output);
    // Listing failure must abort even when there is an expired reservation.
    // Otherwise a failed listing could still perform metadata/storage writes.
    listError = Object.assign(new Error("synthetic listing unavailable"), { code: 503 });
    const initialFiles = [...files];
    await assert.rejects(run(false));
    assert.deepEqual([...files], initialFiles);
    assert.deepEqual(deleted, []);
    assert.equal((await restricted.pool.query("SELECT status FROM sbu_documents WHERE id=$1",
      [abandoned.id])).rows[0].status, "pending");
    // Keep this row ready for the full sweep, including its implied final path.
    await restricted.pool.query("UPDATE sbu_documents SET status='ready' WHERE id=$1", [abandoned.id]);
    expectedKept.set(abandoned.objectPath, { ...files.get(abandoned.objectPath) });
    files.set(final(abandoned.id), object(final(abandoned.id)));
    expectedKept.set(final(abandoned.id), { ...files.get(final(abandoned.id)) });
    listError = undefined;
    listings.length = 0;
    let candidates = 0;
    for (let i = 0; i < 6; i++) {
      const counts = await run(true);
      assert.equal(counts.stopped, 0);
      assert.equal(counts.deletedObjects, 0);
      assert.equal(counts.expiredReservations, 0);
      candidates += counts.candidates;
    }
    assert.equal(candidates, oldOrphans.length);
    assert.deepEqual(listings.map((o) => o.prefix), [
      ...Array(3).fill("private/uploads/"), ...Array(3).fill("private/documents/"),
    ]);
    for (const i of [0, 3]) assert.equal(listings[i].pageToken, undefined);
    for (const i of [1, 2, 4, 5]) assert.ok(listings[i].pageToken);
    assert.deepEqual(deleted, []);
    assert.equal(files.size, initialFiles.length + 1);

    // A process restart discards its in-memory cursor midway through uploads.
    await run(false);
    assert.ok(deleted.length > 0);
    ({ runDocumentCleanup: run } = await import(`${output}?restart=1`));
    await run(false);
    assert.equal(listings.at(-1).prefix, "private/uploads/");
    assert.equal(listings.at(-1).pageToken, undefined);
    const continuation = listings.length;
    listError = Object.assign(new Error("temporary listing failure"), { code: 503 });
    const beforeFailure = [...files], beforeDeleted = [...deleted];
    await assert.rejects(run(false));
    const failedCursor = { ...listings.at(-1) };
    assert.ok(failedCursor.pageToken);
    assert.deepEqual([...files], beforeFailure);
    assert.deepEqual(deleted, beforeDeleted);
    listError = undefined;

    // A reference snapshot failure must happen BEFORE listing. Promote a
    // late-page orphan after the failure to prove the retry reads fresh rows.
    await admin.query(`ALTER TABLE "${schema}".sbu_documents RENAME TO hidden_documents`);
    try {
      await assert.rejects(run(false));
      assert.equal(listings.length, continuation + 1);
      assert.deepEqual([...files], beforeFailure);
      assert.deepEqual(deleted, beforeDeleted);
    } finally {
      await admin.query(`ALTER TABLE "${schema}".hidden_documents RENAME TO sbu_documents`);
    }
    const promotedPath = oldOrphans.find((path) => path.includes("/documents/") && path.endsWith("000000012403"));
    assert.ok(promotedPath && files.has(promotedPath));
    const promotedId = promotedPath.split("/").at(-1);
    await restricted.pool.query("INSERT INTO sbu_documents VALUES ($1,'ready',$2,$3)",
      [promotedId, promotedPath, new Date(old)]);
    expectedKept.set(promotedPath, { ...files.get(promotedPath) });
    // The provider invalidates the outstanding token. This failed round cannot
    // delete anything, and the next must reset only this namespace's cursor.
    epoch++;
    await assert.rejects(run(false), { name: "Error", message: "Cleanup page token rejected" });
    assert.deepEqual(listings.at(-1), failedCursor);
    assert.deepEqual([...files], beforeFailure);
    assert.deepEqual(deleted, beforeDeleted);
    await run(false);
    assert.equal(listings.at(-1).prefix, "private/uploads/");
    assert.equal(listings.at(-1).pageToken, undefined);
    for (let i = 0; i < 3; i++) await run(false);
    assert.equal(listings.at(-1).prefix, "private/documents/");
    assert.equal(listings.at(-1).pageToken, undefined);
    const beforeDocumentReset = [...files], beforeDocumentDeletes = [...deleted];
    epoch++;
    await assert.rejects(run(false), { message: "Cleanup page token rejected" });
    assert.equal(listings.at(-1).prefix, "private/documents/");
    assert.ok(listings.at(-1).pageToken);
    assert.deepEqual([...files], beforeDocumentReset);
    assert.deepEqual(deleted, beforeDocumentDeletes);
    await run(false);
    assert.equal(listings.at(-1).prefix, "private/documents/");
    assert.equal(listings.at(-1).pageToken, undefined);
    // Finish a complete cycle, then repeat it to prove idempotence and that
    // no tail orphan was silently skipped by restart/reset or page deletion.
    for (let i = 0; i < 11; i++) assert.equal((await run(false)).stopped, 0);
    assert.deepEqual(files, expectedKept);
    assert.deepEqual(new Set(deleted), new Set(oldOrphans.filter((path) => path !== promotedPath)));
    assert.equal(deleted.length, new Set(deleted).size);
    const remainingRows = (await restricted.pool.query("SELECT id,status,object_path FROM sbu_documents")).rows;
    assert.equal(remainingRows.length, rows.length + 1);
    assert.ok(remainingRows.every((r) => r.status === "ready" && files.has(r.object_path)));

    // Start a fresh full cycle, without restarting or invalidating its tokens
    // afterward. New keys behind a live keyset cursor are legitimately absent
    // from this cycle; wrapping both namespaces must discover them next time.
    ({ runDocumentCleanup: run } = await import(`${output}?behind-cursor=1`));
    const lateOrphans = [], lateReadyRows = [];
    const beforeLateDeletes = [...deleted];
    const cycleStart = listings.length;
    for (const namespace of ["uploads", "documents"]) {
      const firstPageIndex = listings.length;
      const counts = await run(false);
      assert.equal(counts.stopped, 0);
      assert.equal(counts.deletedObjects, 0);
      assert.equal(listings.at(-1).prefix, `private/${namespace}/`);
      assert.equal(listings.at(-1).pageToken, undefined);

      // Distinct valid UUIDs sort near the namespace start, before the active
      // page boundary. Insert only AFTER the first page has been processed.
      const inserted = ["a", "b", "c"].map((suffix) => {
        const id = uuid(namespace === "uploads" ? 0 : 10000).slice(0, -1) + suffix;
        const path = `/objects/${namespace}/${id}`;
        assert.equal(files.has(path), false);
        const entry = object(path, suffix === "b" ? now : old, `10${suffix.charCodeAt(0)}`);
        files.set(path, entry);
        if (suffix === "a") lateOrphans.push(path);
        else expectedKept.set(path, { ...entry });
        return { id, path };
      });
      const ready = inserted[2];
      await restricted.pool.query("INSERT INTO sbu_documents VALUES ($1,'ready',$2,$3)",
        [ready.id, ready.path, new Date(old)]);
      lateReadyRows.push({ id: ready.id, status: "ready", object_path: ready.path });

      for (let page = 0; page < 2; page++) {
        const continued = await run(false);
        assert.equal(continued.stopped, 0);
        assert.equal(continued.deletedObjects, 0);
        const listing = listings.at(-1);
        assert.equal(listing.prefix, `private/${namespace}/`);
        assert.ok(listing.pageToken);
        const [version, boundary] = JSON.parse(listing.pageToken);
        assert.equal(version, epoch, "the active token is not rejected or reset");
        for (const { path } of inserted) {
          assert.ok(`private/${path.slice("/objects/".length)}` < boundary,
            "inserted objects really are behind the active cursor");
          assert.ok(files.has(path), "the current cycle must not visit keys behind its cursor");
        }
      }
      assert.equal(listings.length, firstPageIndex + 3);
    }
    assert.deepEqual(listings.slice(cycleStart).map((o) => o.prefix), [
      ...Array(3).fill("private/uploads/"), ...Array(3).fill("private/documents/"),
    ]);
    assert.deepEqual(deleted, beforeLateDeletes);
    assert.deepEqual(files, new Map([
      ...expectedKept, ...lateOrphans.map((path) => [path, files.get(path)]),
    ]));
    const beforeNextCycle = listings.length;
    for (let page = 0; page < 6; page++) {
      const counts = await run(false);
      assert.equal(counts.stopped, 0);
      assert.equal(counts.failures, 0);
      assert.equal(counts.expiredReservations, 0);
    }
    const nextCycle = listings.slice(beforeNextCycle);
    assert.deepEqual(nextCycle.map((o) => o.prefix), [
      ...Array(3).fill("private/uploads/"), ...Array(3).fill("private/documents/"),
    ]);
    for (const i of [0, 3]) assert.equal(nextCycle[i].pageToken, undefined);
    for (const i of [1, 2, 4, 5]) assert.ok(nextCycle[i].pageToken);
    assert.deepEqual(deleted.slice(beforeLateDeletes.length), lateOrphans,
      "the next full cycle deletes exactly the old orphans missed behind the cursor");
    assert.deepEqual(files, expectedKept, "young and ready objects keep their exact generations and ages");
    const afterLateRows = (await restricted.pool.query("SELECT id,status,object_path FROM sbu_documents")).rows;
    assert.deepEqual(afterLateRows.sort((a, b) => a.id.localeCompare(b.id)),
      [...remainingRows, ...lateReadyRows].sort((a, b) => a.id.localeCompare(b.id)));
  } finally {
    if (restricted) await restricted.close();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    delete globalThis.__pagedCleanupPool;
    delete globalThis.__pagedCleanupBucket;
  }
});

test("scheduler warns at three unhealthy rounds, re-arms on recovery, and preserves dry-run privacy", async () => {
  const output = join(temp, "health-job.mjs");
  await build({
    stdin: {
      contents: `export * from "../src/lib/document-cleanup-job";
        export { state } from "cleanup-health-fixture";`,
      resolveDir: dir, loader: "ts",
    },
    outfile: output, bundle: true, platform: "node", format: "esm",
    plugins: [{
      name: "cleanup-health",
      setup(builder) {
        builder.onResolve({ filter: /^cleanup-health-fixture$|^@workspace\/db$|^\.\/document-storage$|^\.\/logger$|^\.\/document-lifecycle-lock$/ },
          () => ({ path: "state", namespace: "health" }));
        builder.onResolve({ filter: /^\.\/document-cleanup-budget$/ }, (args) => {
          if (args.namespace !== "health-budget") return { path: "budget", namespace: "health-budget" };
        });
        builder.onLoad({ filter: /.*/, namespace: "health-budget" }, () => ({
          contents: `import { CleanupBudget as Base, CleanupStopped } from ${JSON.stringify(join(dir, "../src/lib/document-cleanup-budget.ts"))};
            export { CleanupStopped };
            export class CleanupBudget extends Base {
              constructor(options) { super({ operationMs: 5, roundMs: 1000, ...options }); }
            }`, loader: "ts", resolveDir: dir,
        }));
        builder.onLoad({ filter: /.*/, namespace: "health" }, () => ({
          contents: `
            export const state = { logs: [], mode: "timeout", skipped: false, rows: [],
              deletes: 0, expires: 0, transactions: 0 };
            const privateError = () => new Error("private-name /objects/uploads/private https://private.invalid user-id");
            export class InvalidCleanupCursor extends Error {}
            export const documentCleanupLock = {};
            export const documentsTable = {};
            export const db = { transaction: async (run) => {
              state.transactions++;
              return run({
                execute: async () => ({ rows: [{ acquired: !state.skipped }] }),
                select: () => ({ from: async () => {
                  if (state.mode === "db-error") throw privateError();
                  return state.rows;
                } }),
                delete: () => { state.expires++; throw privateError(); },
              });
            } };
            export const documentStorage = {
              listCleanupObjects: async () => {
                if (state.mode === "timeout") return new Promise(() => {});
                if (state.mode === "list-error") throw privateError();
                return { objects: [], nextCursor: { namespace: "uploads" } };
              },
              inspect: async () => {
                if (state.mode === "inspect-error") throw privateError();
                return undefined;
              },
              removeGeneration: async () => { state.deletes++; throw privateError(); },
            };
            export const logger = Object.fromEntries(["info", "warn"].map(level =>
              [level, (counts, message) => state.logs.push({ level, counts, message })]));
          `, loader: "ts",
        }));
      },
    }],
  });
  const { startDocumentCleanup, state } = await import(output);
  const savedInterval = globalThis.setInterval;
  const savedClear = globalThis.clearInterval;
  const savedMode = process.env.SBU_DOCUMENT_CLEANUP_MODE;
  let scheduled;
  globalThis.setInterval = (callback, interval) => {
    assert.equal(interval, 60 * 60_000);
    scheduled = callback;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};
  const alerts = () => state.logs.filter(log => log.message === "Document cleanup repeated incomplete rounds");
  const waitForRound = async (before) => {
    const deadline = Date.now() + 2000;
    while (state.logs.filter(log => log.message === "Document cleanup counts").length === before) {
      assert.ok(Date.now() < deadline, "scheduled cleanup must settle");
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  };
  const tick = async () => {
    const before = state.logs.filter(log => log.message === "Document cleanup counts").length;
    scheduled();
    await waitForRound(before);
  };
  try {
    for (const mode of ["delete", "dry-run"]) {
      state.logs = [];
      state.mode = "timeout";
      state.rows = [];
      process.env.SBU_DOCUMENT_CLEANUP_MODE = mode;
      const stop = startDocumentCleanup();
      try {
        await waitForRound(0); // startup counts as the first round
        await tick();
        assert.equal(alerts().length, 0);
        state.skipped = true;
        await tick();
        assert.equal(alerts().length, 0, "lock skips do not advance the streak");
        state.skipped = false;
        await tick();
        assert.deepEqual(alerts(), [{
          level: "warn",
          counts: { consecutiveUnhealthyRounds: 3, threshold: 3, stopped: 1,
            failures: 0, timeouts: 1, operations: 1, dryRuns: mode === "dry-run" ? 1 : 0 },
          message: "Document cleanup repeated incomplete rounds",
        }]);
        await tick();
        assert.equal(alerts().length, 1, "a continuing incident does not flood warnings");
        state.mode = "success";
        await tick(); // recovery re-arms warning
        state.mode = "db-error";
        await tick();
        state.mode = "list-error";
        await tick();
        assert.equal(alerts().length, 1);
        state.mode = "inspect-error";
        state.rows = [pending()];
        await tick(); // caught per-object failures also count, without stopped
        assert.equal(alerts().length, 2);
        assert.deepEqual(alerts()[1].counts, {
          consecutiveUnhealthyRounds: 3, threshold: 3, stopped: 0,
          failures: 1, timeouts: 0, operations: 2, dryRuns: mode === "dry-run" ? 1 : 0,
        });
        state.mode = "success";
        if (mode === "delete") state.rows = [];
        await tick();
        if (mode === "dry-run") {
          const lastCounts = state.logs.at(-1).counts;
          assert.equal(lastCounts.reservationCandidates, 1);
          assert.equal(lastCounts.expiredReservations, 0);
          assert.equal(lastCounts.deletedObjects, 0);
        }
        state.rows = [];
        state.mode = "timeout";
        await tick();
        state.mode = "success";
        await tick(); // even a sub-threshold streak resets
        state.mode = "timeout";
        await tick();
        await tick();
        assert.equal(alerts().length, 2);
        await tick();
        assert.equal(alerts().length, 3);
        for (const log of state.logs) {
          assert.ok(Object.values(log.counts).every(value => Number.isSafeInteger(value)));
          assert.doesNotMatch(JSON.stringify(log), /private|\/objects|https:|user-id/);
        }
        assert.equal(state.deletes, 0);
        assert.equal(state.expires, 0);
      } finally { stop(); }
    }
    process.env.SBU_DOCUMENT_CLEANUP_MODE = "off";
    const before = state.transactions;
    startDocumentCleanup()();
    assert.equal(state.transactions, before);
  } finally {
    globalThis.setInterval = savedInterval;
    globalThis.clearInterval = savedClear;
    if (savedMode === undefined) delete process.env.SBU_DOCUMENT_CLEANUP_MODE;
    else process.env.SBU_DOCUMENT_CLEANUP_MODE = savedMode;
  }
});

test("failed DELETE and deferred COMMIT retry deleted reservations and the same orphan page without touching ready objects", async () => {
  const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
  const { Pool } = requireDb("pg");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `cleanup_rollback_${randomUUID().replaceAll("-", "")}`;
  let restricted;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".sbu_documents (
      id uuid PRIMARY KEY, status text NOT NULL, object_path text NOT NULL, created_at timestamptz NOT NULL)`);
    await admin.query(`CREATE TABLE "${schema}".failure_control (mode text NOT NULL)`);
    await admin.query(`INSERT INTO "${schema}".failure_control VALUES ('off')`);
    // Real PostgreSQL failures: the deferred constraint trigger fires only at
    // COMMIT, after Drizzle's callback has returned and storage has changed.
    await admin.query(`CREATE FUNCTION "${schema}".reject_expiration() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "${schema}".failure_control WHERE mode = TG_NAME) THEN
          RAISE EXCEPTION 'synthetic cleanup % failure', TG_NAME USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
      END $$`);
    await admin.query(`CREATE TRIGGER delete_failure BEFORE DELETE ON "${schema}".sbu_documents
      FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_expiration()`);
    await admin.query(`CREATE CONSTRAINT TRIGGER commit_failure AFTER DELETE ON "${schema}".sbu_documents
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_expiration()`);
    restricted = await createRestrictedRoutePool(admin, schema);
    globalThis.__rollbackCleanupPool = restricted.pool;
    const productionLocks = await readFile(join(dir, "../src/lib/document-lifecycle-lock.ts"), "utf8");
    const fixtureLocks = productionLocks.replaceAll("(137, 1)", `(${randomInt(1_000_000, 2_000_000_000)}, 1)`);
    assert.notEqual(fixtureLocks, productionLocks);
    const output = join(temp, "rollback-job.mjs");
    await build({
      entryPoints: [join(dir, "../src/lib/document-cleanup-job.ts")], outfile: output,
      bundle: true, platform: "node", format: "esm",
      external: ["drizzle-orm", "drizzle-orm/*", "pdf-lib"],
      plugins: [{
        name: "rollback-cleanup-fixture",
        setup(builder) {
          for (const [filter, path] of [
            [/^@workspace\/db$/, "db"], [/^\.\/document-storage$/, "storage"],
            [/^\.\/document-lifecycle-lock$/, "locks"], [/^\.\/logger$/, "logger"],
          ]) builder.onResolve({ filter }, () => ({ path, namespace: "rollback-fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "rollback-fixture" }, ({ path }) => ({
            contents: path === "db" ? `
              import {drizzle} from "drizzle-orm/node-postgres";
              export {documentsTable} from ${JSON.stringify(join(dir, "../../../lib/db/src/schema/standalone.ts"))};
              export const db = drizzle(globalThis.__rollbackCleanupPool);
            ` : path === "storage" ? `
              export const documentStorage = globalThis.__rollbackCleanupStorage;
              export class InvalidCleanupCursor extends Error {}
            ` : path === "locks" ? fixtureLocks : "export const logger = {info(){},warn(){}};",
            loader: "ts", resolveDir: dir,
          }));
        },
      }],
    });
    for (const mode of ["delete_failure", "commit_failure"]) {
      await restricted.pool.query("UPDATE failure_control SET mode='off'");
      await restricted.pool.query("DELETE FROM sbu_documents");
      const abandoned = pending(), empty = pending();
      abandoned.id = "00000000-0000-4000-8000-000000000001";
      empty.id = "00000000-0000-4000-8000-000000000002";
      const readyFinal = { ...pending(), status: "ready" };
      readyFinal.objectPath = final(readyFinal.id);
      const readyStage = { ...pending(), status: "ready" };
      const conflicting = { ...pending(), objectPath: readyStage.objectPath };
      const rows = [abandoned, empty, readyFinal, readyStage, conflicting];
      for (const r of rows) await restricted.pool.query("INSERT INTO sbu_documents VALUES ($1,$2,$3,$4)",
        [r.id, r.status, r.objectPath, r.createdAt]);
      const protectedPaths = [readyFinal.objectPath, readyStage.objectPath, final(readyStage.id), final(conflicting.id)];
      const orphan = object(stage()), tail = object(stage());
      const f = fixture([
        object(abandoned.objectPath), object(final(abandoned.id)),
        ...protectedPaths.map((path) => object(path)), orphan, tail,
      ]);
      const protectedBytes = protectedPaths.map((path) => [path, { ...f.files.get(path) }]);
      const beforeRows = (await restricted.pool.query("SELECT * FROM sbu_documents ORDER BY id")).rows;
      const listings = [], calls = [];
      let failOrphan = mode === "commit_failure";
      const remove = f.storage.removeGeneration;
      f.storage.removeGeneration = async (entry) => {
        calls.push(entry.path);
        assert.ok(!protectedPaths.includes(entry.path), "ready and conflicting references never reach DELETE");
        if (entry.path === orphan.path && failOrphan) {
          failOrphan = false;
          throw new Error("synthetic transient storage failure");
        }
        return remove(entry);
      };
      globalThis.__rollbackCleanupStorage = {
        ...f.storage,
        listCleanupObjects: async (cursor) => {
          listings.push({ ...cursor });
          if (cursor.namespace === "documents")
            return { objects: [], nextCursor: { namespace: "uploads" } };
          if (cursor.pageToken === "tail")
            return { objects: f.files.has(tail.path) ? [tail] : [], nextCursor: { namespace: "documents" } };
          assert.deepEqual(cursor, { namespace: "uploads" });
          // Snapshot includes protected objects, so orphan handling must also
          // respect references, not just the pending-reservation branch.
          return { objects: [...protectedBytes.map(([, entry]) => entry),
            ...(f.files.has(orphan.path) ? [orphan] : [])],
            nextCursor: { namespace: "uploads", pageToken: "tail" } };
        },
      };
      const { runDocumentCleanup: run } = await import(`${output}?mode=${mode}`);
      await restricted.pool.query("UPDATE failure_control SET mode=$1", [mode]);
      await assert.rejects(run(false), (error) => {
        let cause = error;
        while (cause.cause) cause = cause.cause;
        assert.equal(cause.code, "P0001");
        assert.equal(cause.message, `synthetic cleanup ${mode} failure`);
        return true;
      }, "database failure must reject rather than report success counts");
      assert.ok(f.deleted.includes(abandoned.objectPath));
      assert.ok(f.deleted.includes(final(abandoned.id)), "external deletes survive database rollback");
      assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_documents ORDER BY id")).rows, beforeRows,
        "rollback retains every reservation and ready row");
      assert.ok(f.files.has(orphan.path), "unprocessed or failed orphan remains on the failed page");
      assert.equal(calls.includes(orphan.path), mode === "commit_failure",
        "only the COMMIT failure occurs after orphan processing");
      assert.ok(f.files.has(tail.path));
      assert.deepEqual(protectedPaths.map((path) => [path, f.files.get(path)]), protectedBytes);

      await restricted.pool.query("UPDATE failure_control SET mode='off'");
      const retry = await run(false);
      assert.deepEqual(listings[1], listings[0], "failed transaction must not advance the listing cursor");
      assert.equal(retry.expiredReservations, 2, "missing bytes do not strand rolled-back reservations");
      assert.equal(retry.deletedObjects, 1, "retry reaches the orphan left on the failed page");
      assert.equal(retry.failures, 0);
      assert.equal(retry.stopped, 0);
      assert.ok(!f.files.has(orphan.path));
      assert.ok(f.files.has(tail.path));
      assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_documents ORDER BY id")).rows,
        beforeRows.filter((r) => ![abandoned.id, empty.id].includes(r.id)));
      const next = await run(false);
      assert.deepEqual(listings[2], { namespace: "uploads", pageToken: "tail" },
        "successful commit advances traversal");
      assert.equal(next.deletedObjects, 1);
      assert.equal((await run(false)).deletedObjects, 0); // documents -> uploads
      assert.equal((await run(false)).deletedObjects, 0); // repeat safely
      assert.deepEqual([...f.files].sort(), [...protectedBytes].sort());
      assert.deepEqual(new Set(f.deleted), new Set([abandoned.objectPath, final(abandoned.id), orphan.path, tail.path]));
      assert.equal(f.deleted.length, 4, "already missing objects are not deleted again");
    }
  } finally {
    try {
      if (restricted) await restricted.close();
    } finally {
      try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally {
        await admin.end();
        delete globalThis.__rollbackCleanupPool;
        delete globalThis.__rollbackCleanupStorage;
      }
    }
  }
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
    // Advisory locks are database-wide, not search_path/schema-local. Keep the
    // production lock SQL/modes but isolate its key from the running API and
    // parallel route tests, otherwise unrelated shared locks cause false skips.
    const productionLocks = await readFile(join(dir, "../src/lib/document-lifecycle-lock.ts"), "utf8");
    const fixtureLocks = productionLocks.replaceAll("(137, 1)", `(${randomInt(1_000_000, 2_000_000_000)}, 1)`);
    assert.notEqual(fixtureLocks, productionLocks);
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
          builder.onResolve({ filter: /\/document-lifecycle-lock$/ }, () => ({ path: "locks", namespace: "fixture" }));
          builder.onResolve({ filter: /^\.\/logger$/ }, () => ({ path: "logger", namespace: "fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: path === "db" ? `
              import {drizzle} from "drizzle-orm/node-postgres";
              export {documentsTable} from ${JSON.stringify(join(dir, "../../../lib/db/src/schema/standalone.ts"))};
              export const db = drizzle(globalThis.__cleanupPool);
            ` : path === "storage" ? `export const documentStorage = globalThis.__cleanupStorage;
              export class InvalidCleanupCursor extends Error {}`
              : path === "locks" ? fixtureLocks :
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
    // Exercise the real job/transaction lock with an indefinitely stalled
    // provider. A new upload must acquire the shared lock BEFORE that provider
    // settles, for list, inspect, and conditional-delete timeouts alike.
    for (const method of ["listCleanupObjects", "inspect", "removeGeneration"]) {
      const abandoned = pending();
      await restricted.pool.query("INSERT INTO sbu_documents VALUES ($1,$2,$3,$4)",
        [abandoned.id, abandoned.status, abandoned.objectPath, abandoned.createdAt]);
      f.files.set(abandoned.objectPath, object(abandoned.objectPath));
      f.files.set(final(abandoned.id), object(final(abandoned.id)));
      const adapter = globalThis.__cleanupStorage;
      const original = adapter[method];
      const cursors = [];
      const originalList = adapter.listCleanupObjects;
      adapter.listCleanupObjects = async (cursor) => {
        cursors.push({ ...cursor });
        const page = await originalList(cursor);
        return { ...page, nextCursor: { namespace: "documents", pageToken: "must-not-advance" } };
      };
      const delegate = adapter[method];
      let entered, settle, settled = false, calls = 0;
      const started = new Promise((resolve) => { entered = resolve; });
      adapter[method] = (...args) => {
        calls++;
        entered();
        return new Promise((resolve, reject) => {
          settle = async () => {
            try { resolve(await delegate(...args)); }
            catch (error) { reject(error); }
            settled = true;
          };
        });
      };
      const cleaning = runDocumentCleanup(false, { operationMs: 80, roundMs: 2_000 });
      await started;
      assert.deepEqual(await runDocumentCleanup(false), { skipped: 1 });
      const client = await restricted.pool.connect();
      const uploaded = { ...pending(), createdAt: new Date() };
      let stopped;
      try {
        await client.query("BEGIN");
        // A bounded query makes a stuck lock fail this regression promptly.
        await client.query("SET LOCAL statement_timeout = '1500ms'");
        await client.query(shared.sql, shared.params);
        stopped = await cleaning;
        assert.equal(stopped.stopped, 1);
        assert.equal(stopped.timeouts, 1);
        assert.equal(settled, false);
        await client.query("INSERT INTO sbu_documents VALUES ($1,'pending',$2,$3)",
          [uploaded.id, uploaded.objectPath, uploaded.createdAt]);
        await client.query("COMMIT");
        // Completion is another shared-lock transaction; use a fresh final
        // path as the real upload handler does, never adopt an orphan.
        await client.query("BEGIN");
        await client.query(shared.sql, shared.params);
        f.files.set(final(uploaded.id), object(final(uploaded.id), Date.now()));
        await client.query("UPDATE sbu_documents SET status='ready', object_path=$2 WHERE id=$1",
          [uploaded.id, final(uploaded.id)]);
        await client.query("COMMIT");
        assert.equal((await client.query("SELECT status FROM sbu_documents WHERE id=$1",
          [abandoned.id])).rows[0].status, "pending");
        const before = { ...stopped };
        const beforeCalls = calls;
        await settle(); // simulate a DELETE acknowledged only after lock release
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(stopped, before);
        assert.equal(calls, beforeCalls);
        assert.equal(f.files.has(ready.objectPath), true);
        assert.equal(f.files.has(final(uploaded.id)), true);
        assert.equal(f.files.has(final(abandoned.id)), true);
      } finally {
        await client.query("ROLLBACK");
        client.release();
        adapter[method] = original;
        adapter.listCleanupObjects = originalList;
        if (!settled && settle) await settle();
      }
      // Retry the same page, reclaim the incomplete reservation, keep BOTH
      // the old ready document and the one completed after the stop.
      adapter.listCleanupObjects = async (cursor) => {
        cursors.push({ ...cursor });
        return originalList(cursor);
      };
      try {
        const retried = await runDocumentCleanup(false);
        assert.equal(retried.stopped, 0);
        assert.equal(retried.expiredReservations, 1);
        assert.deepEqual(cursors[1], cursors[0], "stopped rounds retry the same listing cursor");
        assert.equal(f.files.has(final(uploaded.id)), true);
        assert.equal(f.files.has(ready.objectPath), true);
      } finally {
        adapter.listCleanupObjects = originalList;
      }
    }
    // Real database stalls, not unresolved JS promises: hold a table lock on
    // the disposable schema while the restricted job owns the exclusive
    // advisory lock. SHARE permits the snapshot but blocks reservation DELETE.
    // ACCESS EXCLUSIVE blocks the snapshot before ANY storage work.
    for (const mode of ["ACCESS EXCLUSIVE", "SHARE"]) {
      const abandoned = pending();
      await restricted.pool.query("INSERT INTO sbu_documents VALUES ($1,$2,$3,$4)",
        [abandoned.id, abandoned.status, abandoned.objectPath, abandoned.createdAt]);
      const orphan = object(stage());
      f.files.set(orphan.path, orphan);
      const blocker = await admin.connect();
      const uploader = await restricted.pool.connect();
      const adapter = globalThis.__cleanupStorage;
      const originals = { ...adapter };
      const calls = [];
      for (const method of ["listCleanupObjects", "inspect", "removeGeneration"]) {
        adapter[method] = (...args) => {
          calls.push(method);
          return originals[method](...args);
        };
      }
      let cleaning, uploading;
      try {
        const baseline = (await uploader.query("SHOW statement_timeout")).rows[0];
        await blocker.query("BEGIN");
        await blocker.query(`LOCK TABLE "${schema}".sbu_documents IN ${mode} MODE`);
        const { rows: [{ pid: blockerPid }] } = await blocker.query("SELECT pg_backend_pid() AS pid");
        const start = performance.now();
        // Attach rejection handling immediately, including assertion-failure
        // paths, so teardown never leaves an unhandled transaction rejection.
        cleaning = runDocumentCleanup(false).then(
          (counts) => ({ counts }), (error) => ({ error }));
        let waiting;
        for (let i = 0; i < 100; i++) {
          const { rows } = await admin.query(`
            SELECT a.pid FROM pg_stat_activity a
            WHERE $1::int = ANY(pg_blocking_pids(a.pid))
              AND a.usename = $2 AND a.wait_event_type = 'Lock'
          `, [blockerPid, (await uploader.query("SELECT current_user AS name")).rows[0].name]);
          if (rows.length) { waiting = rows[0].pid; break; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(waiting, "cleanup must actually wait on the fixture table lock");
        const atStall = [...calls];
        if (mode === "ACCESS EXCLUSIVE") assert.deepEqual(atStall, []);
        else {
          assert.equal(atStall[0], "listCleanupObjects");
          assert.ok(atStall.includes("inspect"));
          assert.ok(!atStall.includes("removeGeneration"));
        }
        const filesBefore = [...f.files], deletedBefore = [...f.deleted];
        await uploader.query("BEGIN");
        await uploader.query("SET LOCAL statement_timeout = '5000ms'");
        let acquired = false;
        uploading = uploader.query(shared.sql, shared.params).then(
          () => { acquired = true; }, (error) => { throw error; });
        // Ensure the uploader was queued behind cleanup, not merely started
        // after its timeout. The blocker still holds the table lock throughout.
        let queued = false;
        for (let i = 0; i < 100; i++) {
          const { rows: [{ blocked }] } = await admin.query(
            "SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked",
            [waiting, uploader.processID]);
          if (blocked) { queued = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(queued, true);
        assert.equal(acquired, false);
        const { error, counts } = await cleaning;
        assert.equal(counts, undefined, "database failure must not report a successful cleanup");
        let cause = error;
        while (cause?.cause) cause = cause.cause;
        assert.equal(cause?.code, "57014", "PostgreSQL must cancel the stalled statement");
        await uploading;
        assert.equal(acquired, true, "rollback releases lifecycle lock before table blocker ends");
        assert.ok(performance.now() - start < 4_500, "database wait must be bounded");
        assert.deepEqual(calls, atStall, "no storage operations after database failure");
        assert.deepEqual([...f.files], filesBefore);
        assert.deepEqual(f.deleted, deletedBefore);
        await uploader.query("COMMIT");
        assert.deepEqual((await uploader.query("SHOW statement_timeout")).rows[0], baseline);
        // Reserve both pool slots to check the cleanup connection too: SET
        // LOCAL must not leak into the next normal upload transaction.
        const reused = await restricted.pool.connect();
        try {
          await reused.query("BEGIN");
          assert.deepEqual((await reused.query("SHOW statement_timeout")).rows[0], baseline);
          await reused.query(shared.sql, shared.params);
          await reused.query("COMMIT");
        } finally {
          await reused.query("ROLLBACK");
          reused.release();
        }
        await blocker.query("ROLLBACK");
        assert.equal((await uploader.query("SELECT status FROM sbu_documents WHERE id=$1",
          [abandoned.id])).rows[0].status, "pending", "failed DELETE leaves reservation retryable");
      } finally {
        await blocker.query("ROLLBACK");
        if (cleaning) await cleaning;
        if (uploading) await uploading.catch(() => {});
        await uploader.query("ROLLBACK");
        blocker.release();
        uploader.release();
        Object.assign(adapter, originals);
      }
      const retry = await runDocumentCleanup(false);
      assert.equal(retry.stopped, 0);
      assert.equal(retry.expiredReservations, 1);
      assert.equal(f.files.has(orphan.path), false);
      assert.equal(f.files.has(ready.objectPath), true);
    }
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
