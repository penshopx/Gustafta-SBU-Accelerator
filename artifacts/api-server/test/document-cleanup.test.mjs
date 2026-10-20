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

test("paged job reaches both namespace tails after dry-run, restart, rejected tokens and failed snapshots", async () => {
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
  } finally {
    if (restricted) await restricted.close();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    delete globalThis.__pagedCleanupPool;
    delete globalThis.__pagedCleanupBucket;
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
