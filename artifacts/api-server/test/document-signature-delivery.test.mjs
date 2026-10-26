import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { ReplitConnectors } from "@replit/connectors-sdk";

const directory = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(directory, ".signature-delivery-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: {
    contents: `export * from "../src/lib/document-signature-delivery";
      export * from "../src/lib/document-signature-monitor";
      export * from "../src/lib/document-signature-slack";
      export * from "../src/lib/document-signatures";
      export { records } from "../src/lib/logger";`,
    resolveDir: directory, loader: "ts",
  },
  outfile: join(temp, "core.mjs"), bundle: true, platform: "node", format: "esm",
  packages: "external",
  plugins: [{
    name: "offline-logger",
    setup(plugin) {
      plugin.onLoad({ filter: /\/lib\/logger\.ts$/ }, () => ({
        contents: `export const records = [];
          export const logger = Object.fromEntries(["warn", "error", "info"].map(
            level => [level, (...args) => records.push({ level, args })]));`,
        loader: "ts",
      }));
    },
  }],
});
const { createSignatureDelivery, createSignatureMonitor, startSignatureUpdates,
  createSlackSignatureTransport, createConfiguredSignatureDelivery,
  SIGNATURE_ALERT_ACTION, records } = await import(join(temp, "core.mjs"));
const alert = {
  event: "scan_signature_alert", severity: "critical", reason: "missing",
  signatureAgeHours: null, hoursUntilExpiry: null, consecutiveFailures: 1,
  action: SIGNATURE_ALERT_ACTION,
};
const recovery = {
  event: "scan_signature_recovered", severity: "info", reason: "healthy",
  signatureAgeHours: 1, hoursUntilExpiry: 167, consecutiveFailures: 0,
  action: "ignored",
};
const settle = () => new Promise(resolve => setImmediate(resolve));
async function until(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail("Delivery did not settle");
}
function fixture(t, overrides = {}) {
  const reports = [];
  const calls = [];
  const delivery = createSignatureDelivery({
    url: "https://collector.example.test/ingest",
    report: event => reports.push(event),
    send: async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); },
    retryDelays: [1, 1],
    ...overrides,
  });
  t.after(() => delivery.stop());
  return { delivery, reports, calls };
}

test("HTTPS JSON contract allow-lists fields and replaces arbitrary action text", async t => {
  const { delivery, calls } = fixture(t, { token: "test-only-token" });
  delivery.enqueue({ ...alert, action: "user=private", userId: "private", document: "secret.pdf" });
  delivery.enqueue(recovery);
  await until(() => calls.length === 2);
  assert.deepEqual(JSON.parse(calls[0].init.body), alert);
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-only-token");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(calls[1].init.body).event, "scan_signature_recovered");
  assert.doesNotMatch(calls.map(c => c.init.body).join(""), /private|secret.pdf|token/);
});

test("unconfigured or invalid configuration never attempts a connection or leaks configuration", t => {
  for (const config of [
    { url: undefined }, { url: "" }, { url: "http://collector.example.test" },
    { url: "https://user:password@collector.example.test" },
    { url: "https://collector.example.test/#secret" },
    { url: "not-an-endpoint" }, { token: "secret\r\nheader" },
    { url: undefined, token: "orphan-token" },
  ]) {
    const { delivery, calls, reports } = fixture(t, config);
    delivery.enqueue(alert);
    assert.equal(calls.length, 0);
    assert.equal(reports.length, 1);
    assert.match(reports[0], /delivery_(unconfigured|invalid_config)$/);
    assert.doesNotMatch(JSON.stringify(reports), /password|secret|orphan|endpoint/);
  }
});

test("HTTP failures retry in FIFO order and report delivery recovery without changing scan state", async t => {
  for (const status of [302, 401, 429, 500]) {
    const bodies = [];
    const { delivery, reports } = fixture(t, {
      send: async (_, init) => {
        bodies.push(init.body);
        return new Response(null, { status: bodies.length === 1 ? status : 204 });
      },
    });
    delivery.enqueue(alert);
    delivery.enqueue(recovery);
    await until(() => bodies.length === 3);
    await settle();
    assert.deepEqual(bodies.map(body => JSON.parse(body).event),
      ["scan_signature_alert", "scan_signature_alert", "scan_signature_recovered"]);
    assert.deepEqual(reports, ["scan_signature_delivery_failed", "scan_signature_delivery_recovered"]);
  }
});

test("network rejection exhausts bounded retries; next recovery can still be delivered", async t => {
  let calls = 0, available = false;
  const { delivery, reports } = fixture(t, {
    send: async () => {
      calls++;
      if (!available) throw new Error("user=private document=secret.pdf credential=secret");
      return new Response(null, { status: 200 });
    },
  });
  delivery.enqueue(alert);
  await until(() => reports.includes("scan_signature_delivery_exhausted"));
  assert.equal(calls, 3);
  available = true;
  delivery.enqueue(recovery);
  await until(() => reports.includes("scan_signature_delivery_recovered"));
  assert.equal(calls, 4);
  assert.doesNotMatch(JSON.stringify(reports), /user=|document=|credential=|secret/);
});

test("hung collector times out and updater keeps running while alert is in flight", async t => {
  let calls = 0, tick, runs = 0, firstSignal;
  const events = [];
  const { delivery, reports } = fixture(t, {
    timeoutMs: 20,
    send: async (_, init) => {
      calls++;
      events.push(JSON.parse(init.body).event);
      if (calls === 1) {
        firstSignal = init.signal;
        return new Promise(() => {}); // Even a transport ignoring abort is bounded.
      }
      return new Response(null, { status: 204 });
    },
  });
  const stop = startSignatureUpdates({
    run: async () => ++runs > 1,
    health: async () => ({ state: "available", builtAt: Date.now() - 3600_000 }),
    notify: createSignatureMonitor(notice => delivery.enqueue(notice)),
    schedule: callback => { tick = callback; return () => {}; },
  });
  t.after(stop);
  await until(() => calls === 1);
  tick();
  await settle();
  assert.equal(runs, 2, "delivery must not hold updater running=true");
  await until(() => calls === 3);
  assert.equal(firstSignal.aborted, true);
  assert.deepEqual(events, ["scan_signature_alert", "scan_signature_alert", "scan_signature_recovered"]);
  assert.deepEqual(reports, ["scan_signature_delivery_failed", "scan_signature_delivery_recovered"]);
});

test("bounded queue signals overflow, stop aborts in-flight delivery and drops queued notices", async t => {
  let calls = 0, signal;
  const { delivery, reports } = fixture(t, {
    send: async (_, init) => {
      calls++;
      signal = init.signal;
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("abort"))));
    },
  });
  for (let i = 0; i < 17; i++) delivery.enqueue(alert);
  assert.equal(calls, 1);
  assert.deepEqual(reports, ["scan_signature_delivery_overflow"]);
  delivery.stop();
  delivery.enqueue(recovery);
  await settle();
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.deepEqual(reports, ["scan_signature_delivery_overflow"]);
});

test("shutdown cancels retry backoff; malformed notices and broken diagnostic sink cannot throw", async t => {
  const { delivery, reports, calls } = fixture(t, {
    send: async () => { calls.push(1); throw new Error("offline"); },
    retryDelays: [50],
  });
  delivery.enqueue({ ...alert, reason: "private reason" });
  delivery.enqueue({ ...alert, consecutiveFailures: NaN });
  assert.equal(calls.length, 0);
  delivery.enqueue(alert);
  await until(() => calls.length === 1);
  await settle();
  delivery.stop();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(calls.length, 1);
  assert.equal(reports.includes("scan_signature_delivery_exhausted"), false);
  const broken = fixture(t, { report: () => { throw new Error("logging offline"); } });
  assert.doesNotThrow(() => broken.delivery.enqueue({ ...alert, event: "private" }));
});

test("default updater wiring preserves structured notices and enqueues both events", async t => {
  const calls = [];
  records.length = 0;
  t.mock.method(globalThis, "fetch", async (_, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(null, { status: 204 });
  });
  const keys = ["DOCUMENT_SIGNATURE_ALERT_URL", "DOCUMENT_SIGNATURE_ALERT_TOKEN",
    "DOCUMENT_SIGNATURE_ALERT_PROVIDER", "DOCUMENT_SIGNATURE_SLACK_CHANNEL",
    "DOCUMENT_SIGNATURE_SLACK_CONNECTION_ID"];
  const original = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  }));
  process.env.DOCUMENT_SIGNATURE_ALERT_URL = "https://collector.example.test/ingest";
  delete process.env.DOCUMENT_SIGNATURE_ALERT_TOKEN;
  process.env.DOCUMENT_SIGNATURE_ALERT_PROVIDER = "https";
  let tick, success = false;
  const stop = startSignatureUpdates({
    run: async () => success,
    health: async () => ({ state: "available", builtAt: Date.now() - 3600_000 }),
    schedule: callback => { tick = callback; return () => {}; },
  });
  t.after(stop);
  await until(() => calls.length === 1);
  success = true;
  tick();
  await until(() => calls.length === 2);
  assert.deepEqual(calls.map(c => c.event), ["scan_signature_alert", "scan_signature_recovered"]);
  assert.deepEqual(records.map(r => r.args[0].event), ["scan_signature_alert", "scan_signature_recovered"]);
});

const channel = "CTEST123";
const connectionId = "conn_slack_test";
const slackAck = () => Response.json({ ok: true, channel, ts: "123.456" });

test("Slack messages contain only safe operational text and never use mentions/unfurls", async () => {
  const calls = [];
  const transport = createSlackSignatureTransport({
    channel, connectionId,
    proxyFactory: () => async (path, init) => { calls.push({ path, init }); return slackAck(); },
  });
  const signal = new AbortController().signal;
  await transport({ ...alert, action: "<!channel> private document", userId: "private" }, signal);
  await transport(recovery, signal);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].path, "/chat.postMessage");
  assert.equal(calls[0].init.signal, signal);
  assert.equal(calls[0].init.redirect, "error");
  assert.deepEqual(calls[0].init.headers, { "Content-Type": "application/json" });
  assert.equal(body.channel, channel);
  assert.equal(body.mrkdwn, false);
  assert.equal(body.parse, "none");
  assert.equal(body.unfurl_links, false);
  assert.equal(body.unfurl_media, false);
  assert.match(body.text, /Peringatan.*\nevent=scan_signature_alert/);
  assert.match(JSON.parse(calls[1].init.body).text, /Pemulihan.*\nevent=scan_signature_recovered/);
  assert.doesNotMatch(body.text, /private|<!channel>|userId|UJI SAMBUNGAN/);
  const synthetic = createSlackSignatureTransport({
    channel, connectionId, testNotice: true,
    proxyFactory: () => async (_, init) => {
      assert.match(JSON.parse(init.body).text, /UJI SAMBUNGAN — BUKAN INSIDEN NYATA/);
      return slackAck();
    },
  });
  await synthetic(alert, signal);
});

test("Slack logical failure at HTTP 200 retries and delivery recovers without leaking response", async t => {
  let requests = 0;
  const transport = createSlackSignatureTransport({
    channel, connectionId,
    proxyFactory: () => async () => {
      requests++;
      return requests === 1 ? Response.json({
        ok: false, error: "private-token-user-document",
      }) : slackAck();
    },
  });
  const { delivery, reports } = fixture(t, { transport });
  delivery.enqueue(alert);
  delivery.enqueue(recovery);
  await until(() => requests === 3);
  await settle();
  assert.deepEqual(reports, ["scan_signature_delivery_failed", "scan_signature_delivery_recovered"]);
  assert.doesNotMatch(JSON.stringify(reports), /private|token|user|document/);
});

test("Slack rejects HTTP errors, malformed JSON and acknowledgements for a different channel", async () => {
  for (const reply of [
    () => new Response("private response", { status: 503 }),
    () => new Response("invalid private json"),
    () => Response.json({ ok: false, error: "not_in_channel" }),
    () => Response.json({ ok: true, channel: "COTHER", ts: "1" }),
    () => Response.json({ ok: true, channel }),
    () => Response.json({ ok: "true", channel, ts: "1" }),
  ]) {
    const transport = createSlackSignatureTransport({
      channel, connectionId, proxyFactory: () => async () => reply(),
    });
    await assert.rejects(transport(alert, new AbortController().signal));
  }
});

test("connector initialization failures stay in delivery boundary; cancelled notices never call SDK", async t => {
  let initialized = 0;
  const transport = createSlackSignatureTransport({
    channel, connectionId,
    proxyFactory: () => { initialized++; throw new Error("identity=private"); },
  });
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(transport(alert, abort.signal));
  assert.equal(initialized, 0);
  const { delivery, reports } = fixture(t, { transport, retryDelays: [] });
  assert.doesNotThrow(() => delivery.enqueue(alert));
  await until(() => reports.includes("scan_signature_delivery_exhausted"));
  assert.equal(initialized, 1);
  assert.doesNotMatch(JSON.stringify(reports), /identity|private/);
});

test("explicit Slack configuration pins the selected connection and does not fall back to HTTPS", async t => {
  const selections = [], bodies = [], reports = [];
  t.mock.method(ReplitConnectors.prototype, "createProxyFetch", (connector, selection) => {
    selections.push({ connector, selection });
    return async (_, init) => { bodies.push(JSON.parse(init.body)); return slackAck(); };
  });
  const delivery = createConfiguredSignatureDelivery(event => reports.push(event), {
    DOCUMENT_SIGNATURE_ALERT_PROVIDER: "slack",
    DOCUMENT_SIGNATURE_SLACK_CHANNEL: channel,
    DOCUMENT_SIGNATURE_SLACK_CONNECTION_ID: connectionId,
    DOCUMENT_SIGNATURE_ALERT_URL: "https://must-not-receive.example.test",
  });
  t.after(() => delivery.stop());
  delivery.enqueue(alert);
  await until(() => bodies.length === 1);
  assert.deepEqual(selections, [{ connector: "slack", selection: { connectionId } }]);
  assert.equal(bodies[0].channel, channel);
  assert.deepEqual(reports, []);
  for (const env of [
    { DOCUMENT_SIGNATURE_ALERT_PROVIDER: "unknown" },
    { DOCUMENT_SIGNATURE_ALERT_PROVIDER: "slack" },
    { DOCUMENT_SIGNATURE_ALERT_PROVIDER: "slack",
      DOCUMENT_SIGNATURE_SLACK_CHANNEL: "private-user-text",
      DOCUMENT_SIGNATURE_SLACK_CONNECTION_ID: connectionId },
    { DOCUMENT_SIGNATURE_ALERT_PROVIDER: "slack", DOCUMENT_SIGNATURE_SLACK_CHANNEL: channel },
  ]) {
    const invalid = createConfiguredSignatureDelivery(event => reports.push(event), {
      DOCUMENT_SIGNATURE_ALERT_URL: "https://must-not-receive.example.test", ...env,
    });
    invalid.enqueue(alert);
    invalid.stop();
  }
  assert.equal(bodies.length, 1);
  assert.equal(reports.length, 4);
  assert.equal(reports.every(r => r === "scan_signature_delivery_invalid_config"), true);
});
