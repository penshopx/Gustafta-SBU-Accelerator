import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import express from "express";
import { build } from "esbuild";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const temporaryDir = await mkdtemp(join(testDir, ".ruang-simpan-route-test-"));
after(() => rm(temporaryDir, { recursive: true, force: true }));

await build({
  entryPoints: [join(testDir, "../src/routes/ruang-simpan.ts")],
  outfile: join(temporaryDir, "route.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["express"],
  plugins: [{
    name: "mock-clerk-auth",
    setup(build) {
      build.onResolve({ filter: /^@clerk\/express$/ }, () => ({
        path: "clerk-mock",
        namespace: "test-clerk",
      }));
      build.onLoad({ filter: /.*/, namespace: "test-clerk" }, () => ({
        contents: `export const getAuth = () => ({ userId: globalThis.__ruangSimpanUserId ?? null });`,
        loader: "js",
      }));
    },
  }],
});

const { default: router } = await import(join(temporaryDir, "route.mjs"));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);
const server = app.listen(0);
after(() => new Promise((resolve, reject) =>
  server.close((error) => error ? reject(error) : resolve())));

function request(path = "/api/ruang-simpan/company-profile", options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...options.headers };
    if (options.body !== undefined && headers["content-length"] === undefined) {
      headers["content-length"] = String(Buffer.byteLength(options.body));
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port: server.address().port,
      path,
      method: options.method ?? "GET",
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

const originalFetch = globalThis.fetch;
const testEnvKeys = new Set();
function setEnv(key, value) {
  testEnvKeys.add(key);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
function configure(mapping = { "owner-one": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A" }) {
  setEnv("RUANG_SIMPAN_CONNECTIONS", JSON.stringify(mapping));
  setEnv("RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A", "test-only-owner-one-token");
  setEnv("RUANG_SIMPAN_TOKEN_TEST_FIXTURE_B", "test-only-owner-two-token");
}
function makeUpstream(body, status = 200, headers = { "content-type": "application/json" }) {
  return new Response(body, { status, headers });
}
function assertNoStore(response) {
  assert.equal(response.headers["cache-control"], "private, no-store");
}
function assertError(response, status, code) {
  assert.equal(response.status, status, response.raw);
  assert.equal(response.body.code, code);
  assertNoStore(response);
}
function validPayload(overrides = {}) {
  return {
    name: "",
    nib: "",
    address: "",
    revision: 0,
    updated_at: null,
    access_token: "do-not-return",
    unknown: "also-do-not-return",
    ...overrides,
  };
}
function installFetch(implementation) {
  globalThis.fetch = implementation;
}
function reset() {
  globalThis.fetch = originalFetch;
  delete globalThis.__ruangSimpanUserId;
}
after(() => {
  reset();
  for (const key of testEnvKeys) delete process.env[key];
});

test("isolates two Clerk owners, forwards only their mapped tokens, and strips upstream extras", async () => {
  configure({
    "owner-one": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A",
    "owner-two": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_B",
  });
  const seen = [];
  installFetch(async (url, options) => {
    seen.push({ url, ...options });
    return makeUpstream(JSON.stringify(validPayload({
      name: options.headers.Authorization === "Bearer test-only-owner-one-token" ? "Company One" : "Company Two",
      updated_at: "2026-06-12T10:11:12.123Z",
    })));
  });

  for (const [owner, token, name] of [
    ["owner-one", "test-only-owner-one-token", "Company One"],
    ["owner-two", "test-only-owner-two-token", "Company Two"],
  ]) {
    globalThis.__ruangSimpanUserId = owner;
    const response = await request();
    assert.equal(response.status, 200, response.raw);
    assertNoStore(response);
    assert.deepEqual(response.body, {
      userId: owner,
      profile: {
        name,
        nib: "",
        address: "",
        revision: 0,
        updated_at: "2026-06-12T10:11:12.123Z",
      },
    });
    assert.ok(!response.raw.includes("token") && !response.raw.includes("unknown"));
    assert.equal(seen.at(-1).url, "https://gustafta.my.id/api/v1/ruang-simpan/company-profile");
    assert.equal(seen.at(-1).method, "GET");
    assert.equal(seen.at(-1).headers.Authorization, `Bearer ${token}`);
    assert.equal(seen.at(-1).cache, "no-store");
    assert.equal(seen.at(-1).redirect, "error");
    assert.ok(seen.at(-1).signal instanceof AbortSignal);
  }
});

test("returns a valid empty profile without changing upstream ISO timestamp text", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  installFetch(async () => makeUpstream(JSON.stringify(validPayload({
    name: "", nib: "", address: "", revision: 4, updated_at: null,
  }))));
  const response = await request();
  assert.equal(response.status, 200, response.raw);
  assert.deepEqual(response.body.profile, {
    name: "", nib: "", address: "", revision: 4, updated_at: null,
  });
});

test("unauthenticated and unmapped users never trigger upstream fetches", async () => {
  configure();
  let calls = 0;
  installFetch(async () => { calls++; throw new Error("unexpected"); });
  delete globalThis.__ruangSimpanUserId;
  assertError(await request(), 401, "unauthenticated");
  configure({ "another-owner": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A" });
  globalThis.__ruangSimpanUserId = "owner-one";
  assertError(await request(), 404, "connection_not_configured");
  setEnv("RUANG_SIMPAN_CONNECTIONS", undefined);
  assertError(await request(), 404, "connection_not_configured");
  assert.equal(calls, 0);
});

test("rejects query strings and any request body before fetching", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  let calls = 0;
  installFetch(async () => { calls++; return makeUpstream("{}"); });
  assertError(await request("/api/ruang-simpan/company-profile?owner=owner-two"), 400, "invalid_request");
  assertError(await request("/api/ruang-simpan/company-profile?",), 400, "invalid_request");
  assertError(await request(undefined, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "owner-two" }),
  }), 400, "invalid_request");
  assert.equal(calls, 0);
});

test("invalid, duplicated, or missing connection secrets fail closed", async () => {
  globalThis.__ruangSimpanUserId = "owner-one";
  let calls = 0;
  installFetch(async () => { calls++; return makeUpstream("{}"); });
  for (const configuration of [
    "{invalid",
    "[]",
    JSON.stringify({ "owner-one": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A", "owner-two": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A" }),
    JSON.stringify({ "owner-one": "GLOBAL_TOKEN" }),
  ]) {
    setEnv("RUANG_SIMPAN_CONNECTIONS", configuration);
    assertError(await request(), 503, "connection_unavailable");
  }
  configure();
  setEnv("RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A", undefined);
  assertError(await request(), 503, "connection_unavailable");
  configure({
    "owner-one": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_A",
    "owner-two": "RUANG_SIMPAN_TOKEN_TEST_FIXTURE_B",
  });
  setEnv("RUANG_SIMPAN_TOKEN_TEST_FIXTURE_B", "test-only-owner-one-token");
  assertError(await request(), 503, "connection_unavailable");
  assert.equal(calls, 0);
});

test("maps invalid credentials, insufficient scope, rate limits, and source failures safely", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  for (const [status, expected, headers] of [
    [401, 424, {}],
    [403, 424, {}],
    [429, 429, { "retry-after": "17" }],
    [429, 429, { "retry-after": "17s" }],
    [503, 503, {}],
    [418, 503, {}],
    [302, 503, { location: "https://attacker.invalid/" }],
  ]) {
    installFetch(async () => makeUpstream("sensitive upstream body must not escape", status, headers));
    const response = await request();
    const expectedCode = status === 401 ? "connection_invalid"
      : status === 403 ? "insufficient_scope"
        : status === 429 ? "rate_limited" : "source_unavailable";
    assertError(response, expected, expectedCode);
    assert.ok(!response.raw.includes("sensitive") && !response.raw.includes("attacker"));
    if (status === 429 && headers["retry-after"] === "17") assert.equal(response.headers["retry-after"], "17");
    else assert.equal(response.headers["retry-after"], undefined);
  }

  installFetch(async () => { throw new TypeError("network error containing token"); });
  const networkFailure = await request();
  assertError(networkFailure, 503, "source_unavailable");
  assert.ok(!networkFailure.raw.includes("token"));
});

test("does not serve stale data after an upstream revocation", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  let responseBody = JSON.stringify(validPayload({ name: "Current upstream profile" }));
  let status = 200;
  installFetch(async () => makeUpstream(responseBody, status));
  const current = await request();
  assert.equal(current.status, 200);
  assert.match(current.raw, /Current upstream profile/);

  status = 401;
  responseBody = JSON.stringify(validPayload({ name: "revoked stale profile" }));
  const revoked = await request();
  assertError(revoked, 424, "connection_invalid");
  assert.ok(!revoked.raw.includes("revoked stale profile"));
});

test("rejects incorrect content types, malformed JSON, invalid shapes and oversized bodies", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  const invalidResponses = [
    makeUpstream("<html>token leak</html>", 200, { "content-type": "text/html" }),
    makeUpstream("{bad json"),
    makeUpstream(JSON.stringify({ ...validPayload(), revision: "1" })),
    makeUpstream(JSON.stringify({ ...validPayload(), revision: -1 })),
    makeUpstream(JSON.stringify({ ...validPayload(), updated_at: "2026-02-30T00:00:00Z" })),
    makeUpstream(JSON.stringify({ ...validPayload(), updated_at: 123 })),
    makeUpstream(JSON.stringify({ ...validPayload(), address: undefined })),
    makeUpstream(JSON.stringify({ profile: [] })),
    makeUpstream(JSON.stringify({ userId: "wrong-shape", profile: validPayload() })),
    makeUpstream("x".repeat(64 * 1024 + 1)),
  ];
  for (const upstream of invalidResponses) {
    installFetch(async () => upstream);
    const response = await request();
    assertError(response, 503, "source_unavailable");
    assert.ok(!response.raw.includes("token leak"));
  }
});

test("cancels unread response streams for rejected statuses and content types", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  for (const [status, contentType] of [
    [401, "application/json"],
    [403, "application/json"],
    [429, "application/json"],
    [500, "application/json"],
    [200, "text/html"],
  ]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("stream intentionally left open"));
      },
      cancel() {
        cancelled = true;
      },
    });
    installFetch(async () => new Response(body, {
      status,
      headers: { "content-type": contentType },
    }));
    const response = await request();
    const expectedStatus = status === 401 || status === 403 ? 424
      : status === 429 ? 429 : 503;
    const expectedCode = status === 401 ? "connection_invalid"
      : status === 403 ? "insufficient_scope"
        : status === 429 ? "rate_limited" : "source_unavailable";
    assertError(response, expectedStatus, expectedCode);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancelled, true, `unread ${status} ${contentType} body must be cancelled`);
  }
});

test("aborts an active upstream stream when the client disconnects", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  let fetchStartedResolve;
  let upstreamReadResolve;
  let upstreamCancelledResolve;
  const fetchStarted = new Promise((resolve) => { fetchStartedResolve = resolve; });
  const upstreamRead = new Promise((resolve) => { upstreamReadResolve = resolve; });
  const upstreamCancelled = new Promise((resolve) => { upstreamCancelledResolve = resolve; });
  let upstreamSignal;
  installFetch(async (_url, options) => {
    upstreamSignal = options.signal;
    fetchStartedResolve();
    const body = new ReadableStream({
      pull() {
        upstreamReadResolve();
      },
      cancel() {
        upstreamCancelledResolve();
      },
    });
    return new Response(body, { headers: { "content-type": "application/json" } });
  });

  const clientRequest = http.request({
    hostname: "127.0.0.1",
    port: server.address().port,
    path: "/api/ruang-simpan/company-profile",
    method: "GET",
  });
  clientRequest.on("error", () => undefined);
  clientRequest.end();
  await fetchStarted;
  await upstreamRead;
  clientRequest.destroy();
  await Promise.race([
    upstreamCancelled,
    new Promise((_, reject) => setTimeout(() => reject(new Error("upstream stream was not cancelled")), 1_000)),
  ]);
  assert.equal(upstreamSignal.aborted, true);
});

test("converts an upstream timeout to a sanitized source-unavailable response", async () => {
  configure();
  globalThis.__ruangSimpanUserId = "owner-one";
  installFetch((_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("timeout with secret token")));
  }));
  const response = await request();
  assertError(response, 503, "source_unavailable");
  assert.ok(!response.raw.includes("secret"));
}, { timeout: 12_000 });