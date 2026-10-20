import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, mkdir, writeFile, utimes, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";

const directory = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(directory, ".signature-monitor-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: {
    contents: `export * from "../src/lib/document-signature-monitor";
      export * from "../src/lib/document-signatures";`,
    resolveDir: directory, loader: "ts",
  },
  outfile: join(temp, "core.mjs"), bundle: true, platform: "node", format: "esm",
  packages: "external",
});
const { createSignatureMonitor, readSignatureHealth, startSignatureUpdates,
  SIGNATURE_MAX_AGE_MS, SIGNATURE_WARNING_AGE_MS,
  SIGNATURE_ALERT_COOLDOWN_MS } = await import(join(temp, "core.mjs"));
const hour = 60 * 60_000;
const day = 24 * hour;
function fixture(age = day) {
  let time = Date.now();
  const builtAt = time - age;
  const notices = [];
  const monitor = createSignatureMonitor((notice) => notices.push(notice), () => time);
  return { notices, monitor, health: { state: "available", builtAt },
    advance: (ms) => { time += ms; } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("CDN unavailable warns immediately, reminds daily, and recovers only once", () => {
  const f = fixture();
  f.monitor(false, f.health);
  assert.equal(f.notices[0].reason, "update_failed");
  assert.equal(f.notices[0].severity, "warning");
  assert.equal(f.notices[0].hoursUntilExpiry, 144);
  assert.match(f.notices[0].action, /database.clamav.net.*disk space/);
  for (let i = 0; i < 50; i++) f.monitor(false, f.health);
  assert.equal(f.notices.length, 1);
  f.advance(SIGNATURE_ALERT_COOLDOWN_MS - 1);
  f.monitor(false, f.health);
  assert.equal(f.notices.length, 1);
  f.advance(1);
  f.monitor(false, f.health);
  assert.equal(f.notices.length, 2);
  assert.equal(f.notices[1].consecutiveFailures, 53);
  f.monitor(true, f.health);
  f.monitor(true, f.health);
  assert.equal(f.notices.length, 3);
  assert.equal(f.notices[2].event, "scan_signature_recovered");
  assert.equal(f.notices[2].consecutiveFailures, 0);
});

test("warning precedes seven days even on updater exit zero; expiry escalates without waiting", () => {
  const f = fixture(SIGNATURE_WARNING_AGE_MS);
  f.monitor(true, f.health);
  assert.equal(f.notices[0].reason, "expiring");
  assert.equal(f.notices[0].hoursUntilExpiry, 48);
  f.advance(SIGNATURE_MAX_AGE_MS - SIGNATURE_WARNING_AGE_MS - 1);
  f.monitor(true, f.health);
  assert.equal(f.notices.at(-1).reason, "expiring");
  f.advance(1);
  f.monitor(true, f.health);
  assert.equal(f.notices.at(-1).reason, "expired");
  assert.equal(f.notices.at(-1).severity, "critical");
  assert.equal(f.notices.at(-1).hoursUntilExpiry, 0);
  f.monitor(true, f.health);
  assert.equal(f.notices.length, 3);
});

test("missing/unreadable databases are critical and not recovered by exit zero", () => {
  for (const state of ["missing", "unreadable"]) {
    const f = fixture();
    f.monitor(true, { state });
    f.monitor(true, { state });
    assert.equal(f.notices.length, 1);
    assert.equal(f.notices[0].reason, state);
    assert.equal(f.notices[0].severity, "critical");
    assert.equal(f.notices[0].hoursUntilExpiry, null);
    f.monitor(true, f.health);
    assert.equal(f.notices.at(-1).event, "scan_signature_recovered");
  }
});

test("flapping updates cannot flood alerts or recovery notices, but critical escalation survives", () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) {
    f.monitor(false, f.health);
    f.monitor(true, f.health);
  }
  assert.equal(f.notices.length, 2);
  f.monitor(true, { state: "missing" });
  assert.equal(f.notices.length, 3);
  assert.equal(f.notices.at(-1).severity, "critical");
});

test("header build epoch, not fresh file mtime, determines age; CLD and missing/malformed supported", async () => {
  const database = join(temp, "database");
  await mkdir(database);
  assert.deepEqual(await readSignatureHealth(database), { state: "missing" });
  await writeFile(join(database, "main.cld"), "main");
  const daily = join(database, "daily.cld");
  const builtAt = Math.floor((Date.now() - 6 * day) / 1000) * 1000;
  const header = (epoch) => `ClamAV-VDB:build time:1:1:90:md5:signature:builder:${epoch}`.padEnd(512, " ");
  await writeFile(daily, header(builtAt / 1000));
  await utimes(daily, new Date(), new Date());
  assert.deepEqual(await readSignatureHealth(database), { state: "available", builtAt });
  await rm(daily);
  const cvd = join(database, "daily.cvd");
  await writeFile(cvd, header(builtAt / 1000));
  assert.deepEqual(await readSignatureHealth(database), { state: "available", builtAt });
  for (const content of ["invalid", header("NaN"), header(0), header(Math.floor(Date.now() / 1000) + 3600)]) {
    await writeFile(cvd, content);
    assert.deepEqual(await readSignatureHealth(database), { state: "unreadable" });
  }
});

test("scheduled CDN failure and recovery are offline, sanitized, and stop cleanly", async () => {
  const f = fixture();
  let tick, cancelled = false, recover = false;
  const privateError = "credential=secret user=private document=confidential.pdf contents=private";
  const stop = startSignatureUpdates({
    run: async () => { if (!recover) throw new Error(privateError); return true; },
    health: async () => f.health,
    notify: f.monitor,
    schedule: (callback) => { tick = callback; return () => { cancelled = true; }; },
  });
  await settle();
  assert.equal(f.notices[0].reason, "update_failed");
  tick(); await settle();
  assert.equal(f.notices.length, 1);
  recover = true;
  tick(); await settle();
  assert.equal(f.notices.at(-1).event, "scan_signature_recovered");
  assert.doesNotMatch(JSON.stringify(f.notices), /credential|private|confidential|contents/);
  assert.deepEqual(Object.keys(f.notices[0]).sort(), [
    "action", "consecutiveFailures", "event", "hoursUntilExpiry", "reason",
    "severity", "signatureAgeHours",
  ]);
  stop(); tick(); await settle();
  assert.equal(cancelled, true);
  assert.equal(f.notices.length, 2);
});

test("nonzero CDN result and health read exceptions alert; overlap and late shutdown results are suppressed", async () => {
  let tick, release, runs = 0;
  const notices = [];
  const stop = startSignatureUpdates({
    run: async () => { runs++; return await new Promise((resolve) => { release = resolve; }); },
    health: async () => { throw new Error("sensitive path"); },
    notify: createSignatureMonitor((notice) => notices.push(notice)),
    schedule: (callback) => { tick = callback; return () => {}; },
  });
  tick(); tick();
  assert.equal(runs, 1);
  release(false); await settle();
  assert.equal(notices[0].reason, "unreadable");
  assert.equal(notices[0].consecutiveFailures, 1);
  tick();
  assert.equal(runs, 2);
  stop(); release(true); await settle();
  assert.equal(notices.length, 1);
});
