import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const directory = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(directory, ".signature-state-"));
const { Pool } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = `signature_${randomUUID().replaceAll("-", "")}`;
let first, second;
after(async () => {
  try { await first?.close(); } finally {
    try { await second?.close(); } finally {
      try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally {
        await admin.end();
        await rm(temp, { recursive: true, force: true });
      }
    }
  }
});
await admin.query(`CREATE SCHEMA "${schema}"`);
const bootstrap = await admin.connect();
try {
  await bootstrap.query(`SET search_path TO "${schema}"`);
  const migration = await readFile(new URL(
    "../../../lib/db/migrations/antivirus-signature-incidents.sql", import.meta.url,
  ), "utf8");
  await bootstrap.query(migration);
  await bootstrap.query(migration); // Startup migration must be repeatable.
} finally { await bootstrap.query("RESET search_path"); bootstrap.release(); }
first = await createRestrictedRoutePool(admin, schema);
second = await createRestrictedRoutePool(admin, schema);
await build({
  stdin: {
    contents: `export * from "../src/lib/document-signature-state";
      export * from "../src/lib/document-signature-monitor";
      export * from "../src/lib/document-signatures";
      export { delivered } from "../src/lib/document-signature-slack";`,
    resolveDir: directory, loader: "ts",
  },
  outfile: join(temp, "core.mjs"), bundle: true, platform: "node", format: "esm", packages: "external",
  plugins: [{
    name: "isolated-updater",
    setup(plugin) {
      plugin.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: "export const pool = { connect: () => globalThis.__signatureTestPool.connect() };",
        loader: "js",
      }));
      plugin.onLoad({ filter: /\/lib\/document-signature-slack\.ts$/ }, () => ({
        contents: `export const delivered = [];
          export const createConfiguredSignatureDelivery = () => ({
            enqueue: n => delivered.push(n), stop() {}
          });`,
        loader: "js",
      }));
      plugin.onLoad({ filter: /\/lib\/logger\.ts$/ }, () => ({
        contents: "export const logger = { info() {}, warn() {}, error() {} };", loader: "js",
      }));
    },
  }],
});
const { createPostgresSignatureStateStore, createSharedSignatureMonitor,
  startSignatureUpdates, delivered, SIGNATURE_ALERT_COOLDOWN_MS } = await import(join(temp, "core.mjs"));
const day = 24 * 3600_000;
let time = Date.now();
const healthy = () => ({ state: "available", builtAt: time - day });
const notices = [], reports = [];
const monitor = pool => createSharedSignatureMonitor(
  n => notices.push(n), e => reports.push(e), createPostgresSignatureStateStore(pool, () => time),
);
async function reset() {
  await first.pool.query("DELETE FROM antivirus_signature_incidents");
  notices.length = reports.length = 0;
  time = Date.now();
}

test("two independent instances race on first alert, reminder boundary, and recovery without duplicates", async () => {
  await reset();
  const a = monitor(first.pool), b = monitor(second.pool);
  await Promise.all([a(false, healthy()), b(false, healthy())]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].severity, "warning");
  time += SIGNATURE_ALERT_COOLDOWN_MS - 1;
  await Promise.all([a(false, healthy()), b(false, healthy())]);
  assert.equal(notices.length, 1);
  time++;
  await Promise.all([a(false, healthy()), b(false, healthy())]);
  assert.equal(notices.length, 2);
  await Promise.all([a(true, healthy()), b(true, healthy())]);
  assert.deepEqual(notices.map(n => n.event), [
    "scan_signature_alert", "scan_signature_alert", "scan_signature_recovered",
  ]);
  assert.deepEqual(reports, []);
});

test("new monitor and new physical database pool retain alert cooldown and pending recovery", async () => {
  await reset();
  await monitor(first.pool)(false, healthy());
  // Tear down the whole instance's physical connections, not just its closure.
  await first.close();
  first = await createRestrictedRoutePool(admin, schema);
  const restarted = monitor(first.pool);
  await restarted(false, healthy());
  assert.equal(notices.length, 1);
  await restarted(true, healthy());
  assert.equal(notices.at(-1).event, "scan_signature_recovered");
  await monitor(second.pool)(true, healthy());
  assert.equal(notices.length, 2);
  await first.close();
  first = await createRestrictedRoutePool(admin, schema);
  await monitor(first.pool)(false, healthy());
  await monitor(first.pool)(true, healthy());
  assert.equal(notices.length, 2, "restart must preserve recovery cooldown too");
});

test("recovery cooldown opens at exactly 24h, not one millisecond earlier", async () => {
  await reset();
  const a = monitor(first.pool), b = monitor(second.pool);
  await a(false, healthy());
  await b(true, healthy());
  time += day - 1;
  await b(false, healthy());
  await a(true, healthy());
  assert.equal(notices.length, 2);
  time++;
  await Promise.all([a(false, healthy()), b(false, healthy())]);
  await Promise.all([a(true, healthy()), b(true, healthy())]);
  assert.equal(notices.filter(n => n.event === "scan_signature_recovered").length, 2);
});

test("warning to critical escalates immediately on another or restarted instance, once only", async () => {
  await reset();
  await monitor(first.pool)(false, healthy());
  time++;
  await Promise.all([
    monitor(first.pool)(true, { state: "missing" }),
    monitor(second.pool)(true, { state: "unreadable" }),
  ]);
  assert.deepEqual(notices.map(n => n.severity), ["warning", "critical"]);
  await monitor(second.pool)(true, { state: "missing" });
  assert.equal(notices.length, 2);
  await monitor(first.pool)(true, healthy());
  await monitor(second.pool)(false, healthy());
  await monitor(second.pool)(true, { state: "missing" });
  assert.equal(notices.filter(n => n.severity === "critical").length, 1,
    "flapping must not reset shared escalation state");
});

test("only fixed-key operational fields persist; malformed or user-specific keys cannot be stored", async () => {
  await reset();
  await monitor(first.pool)(false, { ...healthy(), user: "private", document: "private.pdf" });
  const { rows } = await first.pool.query("SELECT * FROM antivirus_signature_incidents");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].incident_key, "antivirus-signatures");
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "failures", "incident", "incident_key", "last_alert_ms", "last_recovery_ms", "last_severity",
  ]);
  assert.doesNotMatch(JSON.stringify({ rows, notices, reports }), /private/);
  await assert.rejects(first.pool.query(
    "INSERT INTO antivirus_signature_incidents (incident_key) VALUES ('user-specific')",
  ), { code: "23514" });
});

test("SQL error rolls back transition, releases connection, and permits later retry", async () => {
  await reset();
  let fail = true, released = 0;
  const source = {
    connect: async () => {
      const client = await first.pool.connect();
      return {
        query: (...args) => {
          if (fail && args[0].startsWith("UPDATE antivirus")) {
            return client.query("SELECT 1/0");
          }
          return client.query(...args);
        },
        release: () => { released++; client.release(); },
      };
    },
  };
  const observe = createPostgresSignatureStateStore(source, () => time);
  await assert.rejects(observe(false, healthy()), { code: "22012" });
  assert.equal((await first.pool.query("SELECT * FROM antivirus_signature_incidents")).rowCount, 0);
  assert.equal(released, 1);
  fail = false;
  assert.equal((await observe(false, healthy())).event, "scan_signature_alert");
  assert.equal(released, 2);
});

test("production clock comes from database rather than the caller's process clock", async () => {
  await reset();
  const before = Number((await first.pool.query(
    "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms",
  )).rows[0].ms);
  await createPostgresSignatureStateStore(first.pool)(true, { state: "missing" });
  const { rows: [row] } = await first.pool.query("SELECT last_alert_ms FROM antivirus_signature_incidents");
  const afterTime = Number((await first.pool.query(
    "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms",
  )).rows[0].ms);
  assert.ok(Number(row.last_alert_ms) >= before && Number(row.last_alert_ms) <= afterTime);
});

test("default updater wiring uses shared storage before enqueue, including after restart", async t => {
  await reset();
  delivered.length = 0;
  globalThis.__signatureTestPool = first.pool;
  t.after(() => { delete globalThis.__signatureTestPool; });
  let success = false;
  const ticks = [];
  const completed = [];
  function start() {
    const done = [];
    const stop = startSignatureUpdates({
      run: async () => success,
      health: async () => healthy(),
      schedule: tick => { ticks.push(tick); return () => {}; },
      // Use the real shared adapter and default database connection resolution.
      createMonitor: (notify, report) => {
        const observe = createSharedSignatureMonitor(notify, report);
        return async (...args) => { await observe(...args); done.push(true); };
      },
    });
    completed.push(done);
    t.after(stop);
    return stop;
  }
  async function until(condition) {
    for (let i = 0; i < 100; i++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail("Updater did not settle");
  }
  const stopA = start();
  start();
  await until(() => completed.every(done => done.length === 1));
  assert.equal(delivered.length, 1);
  stopA();
  start();
  await until(() => completed[2].length === 1);
  assert.equal(delivered.length, 1);
  success = true;
  ticks[1]();
  ticks[2]();
  await until(() => completed[1].length === 2 && completed[2].length === 2);
  assert.deepEqual(delivered.map(n => n.event), ["scan_signature_alert", "scan_signature_recovered"]);
});
