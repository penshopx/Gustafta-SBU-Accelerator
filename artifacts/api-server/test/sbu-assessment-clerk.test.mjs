import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { logger as clerkLogger } from "@clerk/shared/logger";

function guardOutboundFetch(target = globalThis) {
  const originalFetch = target.fetch;
  const attempts = [];
  target.fetch = async (input, init) => {
    const url = new URL(input instanceof URL ? input.href
      : typeof input === "string" ? input : input.url);
    // Literal loopback addresses only; do not resolve arbitrary DNS names.
    const isLoopback = /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
      || url.hostname === "[::1]";
    if (!isLoopback || !["http:", "https:"].includes(url.protocol)) {
      attempts.push(url.origin);
      throw new Error(`Unexpected outbound request: ${url.origin}`);
    }
    // Native fetch follows redirects internally without re-entering this
    // wrapper. Do not let a loopback response redirect to an external service.
    return originalFetch.call(target, input, { ...init, redirect: "error" });
  };
  return {
    assertNoOutbound() {
      assert.equal(attempts.length, 0,
        `Fixture tidak boleh menghubungi layanan luar:\n${attempts.join("\n")}`);
    },
    restore() {
      target.fetch = originalFetch;
    },
  };
}

// Install once before async setup and app imports. SDKs can catch fetch errors,
// so both per-test and suite assertions inspect the persistent attempt log.
const outboundFetch = guardOutboundFetch();
afterEach(() => outboundFetch.assertNoOutbound());

// Match session-fixture compatibility warnings, not normal development-key or
// dev-browser diagnostics. Do not pin the guard to only today's missing-azp text.
function isSessionCompatibilityWarning(message) {
  return /\bClerk\b/i.test(message)
    && /\bsession[\s-]*(?:token|jwt)\b/i.test(message)
    && /missing\b.*\bclaim\b|future (?:version|release)|deprecat|outdated|legacy|unsupported|incompatib|invalid\b.*\bversion\b/i.test(message);
}

function captureSessionCompatibilityWarnings(logger = clerkLogger, warningConsole = console) {
  const warnings = new Set();
  const originalWarnOnce = logger.warnOnce;
  const originalWarn = warningConsole.warn;
  const collect = (args) => {
    const message = args.map(String).join(" ");
    if (isSessionCompatibilityWarning(message)) warnings.add(message);
  };
  // Observe before Clerk's warnOnce deduplication: an earlier request must not
  // hide an incompatible fixture from the assertions for later requests.
  logger.warnOnce = function (...args) {
    collect(args);
    return originalWarnOnce.apply(this, args);
  };
  warningConsole.warn = function (...args) {
    collect(args);
    return originalWarn.apply(this, args);
  };
  return {
    assertCompatible() {
      assert.equal(warnings.size, 0,
        `Fixture sesi Clerk perlu diperbarui:\n${[...warnings].join("\n")}`);
    },
    restore() {
      logger.warnOnce = originalWarnOnce;
      warningConsole.warn = originalWarn;
    },
  };
}

function checkSessionWarningGuard() {
  const forwarded = [];
  const warningConsole = { warn: (...args) => forwarded.push(args) };
  // Model an already-deduplicated Clerk logger; capture must still see it.
  const logger = { warnOnce() {} };
  const originalWarnOnce = logger.warnOnce;
  const originalWarn = warningConsole.warn;
  const guard = captureSessionCompatibilityWarnings(logger, warningConsole);
  try {
    warningConsole.warn("Clerk has been loaded with development keys.");
    logger.warnOnce("Clerk: Missing dev browser token.");
    warningConsole.warn("Application: legacy session token fixture.");
    guard.assertCompatible();
    assert.equal(forwarded.length, 2, "peringatan konsol tetap diteruskan");

    logger.warnOnce("Clerk: Session token from cookie is missing the azp claim. In a future version of Clerk, this token will be considered invalid.");
    assert.throws(() => guard.assertCompatible(), /Fixture sesi Clerk perlu diperbarui:[\s\S]*azp/);
  } finally {
    guard.restore();
  }
  assert.equal(logger.warnOnce, originalWarnOnce);
  assert.equal(warningConsole.warn, originalWarn);

  const futureGuard = captureSessionCompatibilityWarnings(logger, warningConsole);
  try {
    warningConsole.warn("Clerk:", "Session token v1 is deprecated; migrate to v2.");
    assert.throws(() => futureGuard.assertCompatible(), /Session token v1 is deprecated/);
  } finally {
    futureGuard.restore();
  }
  assert.equal(logger.warnOnce, originalWarnOnce);
  assert.equal(warningConsole.warn, originalWarn);
}

// Install before importing the app or making any real middleware requests.
// Restore all instrumentation and temporary files before asserting: a failing
// root after hook can prevent later after hooks from running.
const sessionWarnings = captureSessionCompatibilityWarnings();
let temporaryDir;
after(async () => {
  outboundFetch.restore();
  sessionWarnings.restore();
  try {
    if (temporaryDir) await rm(temporaryDir, { recursive: true, force: true });
  } finally {
    outboundFetch.assertNoOutbound();
    sessionWarnings.assertCompatible();
  }
});

const testDir = fileURLToPath(new URL(".", import.meta.url));
temporaryDir = await mkdtemp(join(testDir, ".sbu-clerk-test-"));

// Never use the workspace's real Clerk credentials, even when they are present.
// This key is only a syntactically valid test key; no Clerk account is involved.
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`;
process.env.CLERK_SECRET_KEY = "sk_test_not_a_real_secret";
process.env.NODE_ENV = "test";
process.env.CLERK_ALLOWED_HOSTS = "sbu.example.test,penilaian.example.test";
// A separate loopback address represents the configured edge; ordinary local
// clients (127.0.0.1) are explicitly NOT trusted.
process.env.CLERK_TRUSTED_PROXY_CIDRS = "127.0.0.2/32";
process.env.CLERK_TELEMETRY_DISABLED = "1";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.CLERK_JWT_KEY = publicKey.export({ type: "spki", format: "pem" });

// azp identifies the application origin, not the Clerk token issuer. Requests
// carry the same Origin while their actual connection stays on loopback.
const testOrigin = "http://sbu.example.test";

function sessionToken(userId, times = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "local-test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: userId, sid: `session-${userId}`, iss: "https://example.clerk.accounts.dev",
    azp: testOrigin,
    iat: now, nbf: now - 1, exp: now + 300, ...times,
  })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(input).end().sign(privateKey).toString("base64url");
  return `${input}.${signature}`;
}

// Bundle the actual Express app and SBU router. Clerk's middleware and getAuth
// remain real; only persistence and the SQL predicate adapter are replaced.
await build({
  entryPoints: [join(testDir, "../src/app.ts")],
  outfile: join(temporaryDir, "app.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@clerk/*", "@google-cloud/*", "express", "pino", "pino-http", "cors", "http-proxy-middleware"],
  plugins: [{
    name: "isolated-persistence",
    setup(builder) {
      builder.onResolve({ filter: /\/workspace-context$/ }, () => ({
        path: join(testDir, "helpers/workspace-context-fixture.mjs"),
      }));
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "isolated" }));
      builder.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: "sql", namespace: "isolated" }));
      builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
        path: join(testDir, "../../../lib/api-zod/src/index.ts"),
      }));
      builder.onLoad({ filter: /.*/, namespace: "isolated" }, (args) => ({
        contents: args.path === "sql" ? `
          export const eq = (field, value) => (row) => row[field] === value;
          export const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
          export const desc = () => { throw new Error("unexpected ordering"); };
          export const ilike = () => { throw new Error("unexpected vault query"); };
          export const or = () => { throw new Error("unexpected vault query"); };
          // Document lock constants are constructed at import time, not run.
          // Permit only those declarations; all other SQL remains forbidden.
          export const sql = (strings, ...values) => {
            if (values.length === 0 && strings.length === 1 && [
              "SELECT pg_advisory_xact_lock_shared(137, 1)",
              "SELECT pg_try_advisory_xact_lock(137, 1) AS acquired",
            ].includes(strings[0])) return Object.freeze({ isolatedLock: strings[0] });
            throw new Error("unexpected document query");
          };
        ` : `
          export const casesTable = { id: "id", ownerId: "ownerId" };
          export const evidenceTable = { caseId: "caseId" };
          export const transitionVerificationsTable = { track: "track" };
          export const profilesTable = { userId: "userId" };
          export const companyProfilesTable = {};
          export const documentsTable = {};
          export const documentAnalysesTable = {};
          export const db = {
            select() {
              globalThis.__clerkTestDataReads = (globalThis.__clerkTestDataReads ?? 0) + 1;
              return {
                from(table) {
                  return Object.assign(Promise.resolve(table === transitionVerificationsTable ? [] : []), {
                    where(predicate) {
                      if (table === casesTable) globalThis.__clerkTestCaseReads++;
                      if (table === evidenceTable) globalThis.__clerkTestEvidenceReads++;
                      const rows = table === casesTable ? globalThis.__clerkTestCases :
                        table === evidenceTable ? globalThis.__clerkTestEvidence : [];
                      return Promise.resolve(rows.filter(predicate));
                    }
                  });
                }
              };
            }
          };
        `,
        loader: "js",
      }));
    },
  }],
});

const { default: app } = await import(join(temporaryDir, "app.mjs"));

// Register tests only after async setup finishes, so root teardown cannot run
// while the bundle is still being built and restore the guard prematurely.
test("penjaga fixture menolak peringatan kompatibilitas, bukan peringatan development", checkSessionWarningGuard);

test("penjaga outbound mengizinkan loopback dan mencatat kegagalan yang ditangkap SDK", async () => {
  const forwarded = [];
  const target = { fetch: async (...args) => {
    forwarded.push(args);
    return "local-response";
  } };
  const originalFetch = target.fetch;
  const guard = guardOutboundFetch(target);
  try {
    for (const input of [
      "http://127.0.0.1:1234/api/me",
      new URL("http://127.0.0.2:1234/api/me"),
      new Request("http://[::1]:1234/api/me"),
    ]) {
      const init = { headers: { "X-Test": "loopback" } };
      assert.equal(await target.fetch(input, init), "local-response");
      assert.equal(forwarded.at(-1)[0], input);
      assert.deepEqual(forwarded.at(-1)[1], { ...init, redirect: "error" });
    }
    guard.assertNoOutbound();
    for (const input of [
      "https://example.clerk.accounts.dev/v1/jwks",
      new URL("https://api.clerk.com/v1/sessions"),
      new Request("https://127.0.0.1.example.test/api/me"),
      "http://localhost/api/me",
    ]) {
      // Model an SDK returning an unauthenticated result after catching a
      // network failure. The guard must still reject that apparent success.
      await target.fetch(input).catch(() => undefined);
      assert.throws(() => guard.assertNoOutbound(), /Fixture tidak boleh menghubungi layanan luar/);
    }
    assert.equal(forwarded.length, 3, "koneksi keluar tidak diteruskan ke fetch asli");
  } finally {
    guard.restore();
  }
  assert.equal(target.fetch, originalFetch, "fetch tetap dipulihkan setelah penolakan");
});

test("GET privat tab A ditolak dengan cookie B atau tanpa prakondisi sebelum query apa pun", async () => {
  const server = app.listen(0);
  const token = sessionToken("owner-b");
  const cookie = `__session=${token}; __client_uat=${Math.floor(Date.now() / 1000) - 1}; __clerk_db_jwt=local-dev-browser`;
  const paths = [
    "/me", "/workspace", "/dashboard", "/company-profile", "/cases",
    "/cases/35", "/cases/35/evidence", "/cases/35/assessment",
    "/cases/35/preparation-summary", "/cases/35/documents",
    "/cases/35/documents/1/download", "/transition-verifications",
    "/documents", "/cases/35/documents/1/analyses",
  ];
  try {
    for (const path of paths) {
      for (const expectedOwner of [undefined, "", "owner-a"]) {
        globalThis.__clerkTestDataReads = 0;
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
          headers: { origin: testOrigin, cookie,
            ...(expectedOwner === undefined ? {} : { "X-SBU-Form-Owner": expectedOwner }) },
        });
        const raw = await response.text();
        assert.equal(response.status, 409, `${path}: ${raw}`);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(globalThis.__clerkTestDataReads, 0, path);
        assert.doesNotMatch(raw, /owner-b|companyName|caseId|findings|recordedCount/);
      }
    }
    // HEAD must not bypass the GET precondition.
    const head = await fetch(`http://127.0.0.1:${server.address().port}/api/cases/35`, {
      method: "HEAD", headers: { origin: testOrigin, cookie, "X-SBU-Form-Owner": "owner-a" },
    });
    assert.equal(head.status, 409);
    assert.equal(globalThis.__clerkTestDataReads, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    delete globalThis.__clerkTestDataReads;
  }
});

async function request(server, id, headers) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/cases/${id}/assessment`, {
    headers: { origin: testOrigin, "X-SBU-Form-Owner": "owner-a", ...headers },
  });
  const raw = await response.text();
  return { status: response.status, raw, body: JSON.parse(raw) };
}

// Node fetch replaces a supplied Host with the URL's hostname. Keep the
// connection local while sending the public Host verbatim for domain tests.
function requestWithHost(server, id, headers, trusted = false) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1", port: server.address().port,
      localAddress: trusted ? "127.0.0.2" : "127.0.0.1",
      path: `/api/cases/${id}/assessment`, headers: { origin: testOrigin, "X-SBU-Form-Owner": "owner-a", ...headers },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("error", reject);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, raw, body: JSON.parse(raw) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("diagnosis /me membedakan sesi tidak tersedia dari issuer salah tanpa membaca data", async () => {
  globalThis.__clerkTestCaseReads = 0;
  globalThis.__clerkTestEvidenceReads = 0;
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/me`;
    const missing = await fetch(url);
    assert.equal(missing.status, 401);
    assert.equal(missing.headers.get("cache-control"), "private, no-store");
    const missingBody = await missing.json();
    // This isolated development fixture has no Clerk dev-browser credentials.
    // The generic verifier rejection is distinct from the explicit issuer guard.
    assert.equal(missingBody.code, "session_not_verified");
    const wrongIssuerToken = sessionToken("owner-a", { iss: "https://other.clerk.accounts.dev" });
    const mismatch = await fetch(url, {
      headers: { origin: testOrigin, authorization: `Bearer ${wrongIssuerToken}` },
    });
    assert.equal(mismatch.status, 401);
    assert.equal(mismatch.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await mismatch.json(), { error: "Silakan masuk untuk melanjutkan.", code: "session_issuer_mismatch" });
    assert.equal(globalThis.__clerkTestCaseReads, 0);
    assert.equal(globalThis.__clerkTestEvidenceReads, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cookie dan bearer sesi palsu tidak membuka penilaian melalui middleware Clerk", async () => {
  globalThis.__clerkTestCaseReads = 0;
  globalThis.__clerkTestEvidenceReads = 0;
  const forgedJwt = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: "case-owner", exp: 4102444800 })).toString("base64url"),
  ].join(".");
  const server = app.listen(0);
  try {
    for (const headers of [
      { cookie: `__session=${forgedJwt}` },
      { authorization: `Bearer ${forgedJwt}` },
    ]) {
      const response = await request(server, 34, headers);
      assert.equal(response.status, 401, response.raw);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
      assert.doesNotMatch(response.raw, /companyName|ownerId|caseId|evidence|findings|recordedCount|Perusahaan Rahasia|Bukti rahasia|Temuan rahasia/i,
        "respons tidak boleh memuat permohonan, bukti, atau temuan");
      assert.equal(globalThis.__clerkTestCaseReads, 0, "Clerk harus menolak sebelum membaca data");
      assert.equal(globalThis.__clerkTestEvidenceReads, 0);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("sesi bertanda tangan yang kedaluwarsa atau belum aktif ditolak sebelum membaca data", async () => {
  globalThis.__clerkTestCases = [
    { id: 34, ownerId: "owner-a", companyName: "Perusahaan Rahasia" },
  ];
  globalThis.__clerkTestEvidence = [
    { id: 1, caseId: 34, title: "Bukti rahasia" },
  ];
  globalThis.__clerkTestCaseReads = 0;
  globalThis.__clerkTestEvidenceReads = 0;

  const server = app.listen(0);
  try {
    const now = Math.floor(Date.now() / 1000);
    for (const [label, token] of [
      ["kedaluwarsa", sessionToken("owner-a", { iat: now - 1200, nbf: now - 1200, exp: now - 600 })],
      ["belum aktif", sessionToken("owner-a", { nbf: now + 600, exp: now + 1200 })],
    ]) {
      for (const headers of [
        { authorization: `Bearer ${token}` },
        { cookie: `__session=${token}; __client_uat=${now - 1}; __clerk_db_jwt=local-dev-browser` },
      ]) {
        const response = await request(server, 34, headers);
        assert.equal(response.status, 401, `${label}: ${response.raw}`);
        assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." }, label);
        assert.doesNotMatch(response.raw, /Perusahaan Rahasia|Bukti rahasia|owner-a|caseId|evidence|findings/i, label);
        assert.equal(globalThis.__clerkTestCaseReads, 0, `${label}: permohonan tidak boleh dibaca`);
        assert.equal(globalThis.__clerkTestEvidenceReads, 0, `${label}: bukti tidak boleh dibaca`);
      }
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
  }
});

test("sesi bertanda tangan dengan penerbit berbeda ditolak sebelum membaca data", async () => {
  globalThis.__clerkTestCases = [
    { id: 34, ownerId: "owner-a", companyName: "Perusahaan Rahasia" },
  ];
  globalThis.__clerkTestEvidence = [
    { id: 1, caseId: 34, title: "Bukti rahasia" },
  ];
  globalThis.__clerkTestCaseReads = 0;
  globalThis.__clerkTestEvidenceReads = 0;

  const now = Math.floor(Date.now() / 1000);
  const wrongIssuerToken = sessionToken("owner-a", { iss: "https://other.clerk.accounts.dev" });
  const [, encodedPayload] = wrongIssuerToken.split(".");
  const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.equal(claims.iss, "https://other.clerk.accounts.dev");
  assert.ok(claims.nbf <= now && claims.exp > now, "token masih berlaku");

  const server = app.listen(0);
  try {
    for (const headers of [
      { authorization: `Bearer ${wrongIssuerToken}` },
      { cookie: `__session=${wrongIssuerToken}; __client_uat=${now - 1}; __clerk_db_jwt=local-dev-browser` },
    ]) {
      const response = await request(server, 34, headers);
      assert.equal(response.status, 401, response.raw);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
      assert.doesNotMatch(response.raw, /Perusahaan Rahasia|Bukti rahasia|owner-a|caseId|evidence|findings/i);
      assert.equal(globalThis.__clerkTestCaseReads, 0, "permohonan tidak boleh dibaca");
      assert.equal(globalThis.__clerkTestEvidenceReads, 0, "bukti tidak boleh dibaca");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
  }
});

test("domain Clerk dipilih sesuai host/proxy dan issuer lain ditolak tanpa membaca data", async (t) => {
  const developmentKey = process.env.CLERK_PUBLISHABLE_KEY;
  globalThis.__clerkTestCases = [
    { id: 34, ownerId: "owner-a", companyName: "Perusahaan Sendiri", requestType: "baru",
      qualification: "kecil", classification: "gedung", status: "draf", existingSbuExpiresOn: null },
  ];
  globalThis.__clerkTestEvidence = [
    { id: 1, caseId: 34, code: "legalitas", title: "Legalitas", note: "Bukti sendiri" },
  ];
  const server = app.listen(0);
  const primaryHost = "sbu.example.test";
  const alternateHost = "penilaian.example.test";
  const primaryIssuer = `https://clerk.${primaryHost}`;
  const alternateIssuer = `https://clerk.${alternateHost}`;
  const developmentIssuer = "https://example.clerk.accounts.dev";
  const unrelatedIssuer = "https://unrelated.clerk.accounts.dev";

  // A pk_test fallback intentionally bypasses host-derived keys. Use a
  // synthetic pk_live key to exercise the actual multi-domain production path;
  // the real middleware still verifies every token using our local RSA key.
  const productionKey = `pk_live_${Buffer.from(`clerk.${primaryHost}$`).toString("base64")}`;
  const scenarios = [
    { label: "Host domain utama", key: productionKey, headers: { host: primaryHost }, issuer: primaryIssuer },
    { label: "Host domain alternatif", key: productionKey, headers: { host: alternateHost }, issuer: alternateIssuer },
    { label: "Host huruf besar dengan port", key: productionKey,
      headers: { host: "PENILAIAN.EXAMPLE.TEST:443" }, issuer: alternateIssuer },
    { label: "proxy memilih domain utama di atas Host alternatif", key: productionKey,
      trusted: true, headers: { host: alternateHost, "x-forwarded-host": primaryHost }, issuer: primaryIssuer },
    { label: "proxy memilih domain alternatif di atas Host utama", key: productionKey,
      trusted: true, headers: { host: primaryHost, "x-forwarded-host": alternateHost }, issuer: alternateIssuer },
    { label: "proxy tepercaya dengan host internal", key: productionKey,
      trusted: true, headers: { host: "internal.invalid", "x-forwarded-host": " PENILAIAN.EXAMPLE.TEST:443 " }, issuer: alternateIssuer },
    { label: "klien langsung tidak dapat memilih domain alternatif lewat forwarding", key: productionKey,
      headers: { host: primaryHost, "x-forwarded-host": alternateHost }, issuer: primaryIssuer },
    { label: "klien langsung tidak dapat memilih domain utama lewat forwarding", key: productionKey,
      headers: { host: alternateHost, "x-forwarded-host": primaryHost }, issuer: alternateIssuer },
    { label: "rantai forwarding dari klien langsung diabaikan", key: productionKey,
      headers: { host: alternateHost, "x-forwarded-host": `${primaryHost}, ${alternateHost}` }, issuer: alternateIssuer },
    { label: "host asing ditolak", key: productionKey,
      headers: { host: "attacker.example.test", "x-forwarded-host": primaryHost }, status: 421 },
    { label: "host asing melalui proxy ditolak", key: productionKey,
      trusted: true, headers: { host: primaryHost, "x-forwarded-host": "attacker.example.test" }, status: 421 },
    { label: "proxy tidak boleh meneruskan rantai dari klien", key: productionKey,
      trusted: true, headers: { host: alternateHost, "x-forwarded-host": `${primaryHost}, ${alternateHost}` }, status: 421 },
    { label: "proxy kosong kembali ke Host", key: productionKey,
      headers: { host: alternateHost, "x-forwarded-host": "" }, issuer: alternateIssuer },
    { label: "key pengembangan tetap berlaku pada Host alternatif", key: developmentKey,
      headers: { host: alternateHost }, issuer: developmentIssuer },
    { label: "key pengembangan tetap berlaku di belakang proxy", key: developmentKey,
      trusted: true, headers: { host: primaryHost, "x-forwarded-host": alternateHost }, issuer: developmentIssuer },
  ];
  try {
    for (const scenario of scenarios) {
      await t.test(scenario.label, async () => {
        process.env.CLERK_PUBLISHABLE_KEY = scenario.key;
        const host = (scenario.trusted && !scenario.status && scenario.headers["x-forwarded-host"]) || scenario.headers.host;
        const origin = new URL(`http://${host.trim()}`).origin;
        // Both legitimate domain issuers must be tried for every host: this
        // catches a key accidentally fixed to one domain or to the last hop.
        for (const issuer of [primaryIssuer, alternateIssuer, developmentIssuer, unrelatedIssuer]) {
          const token = sessionToken("owner-a", { iss: issuer, azp: origin });
          const now = Math.floor(Date.now() / 1000);
          const [header, payload, signature] = token.split(".");
          assert.ok(createVerify("RSA-SHA256").update(`${header}.${payload}`).end()
            .verify(publicKey, Buffer.from(signature, "base64url")), "JWT uji benar-benar ditandatangani");
          for (const authHeaders of [
            { authorization: `Bearer ${token}` },
            { cookie: `__session=${token}; __client_uat=${now - 1}; __clerk_db_jwt=local-dev-browser` },
          ]) {
            globalThis.__clerkTestCaseReads = 0;
            globalThis.__clerkTestEvidenceReads = 0;
            globalThis.__clerkTestDataReads = 0;
            const response = await requestWithHost(server, 34, { ...scenario.headers, origin, ...authHeaders }, scenario.trusted);
            const context = `${scenario.label}, ${issuer}, ${Object.keys(authHeaders)[0]}: ${response.raw}`;
            if (issuer === scenario.issuer) {
              assert.equal(response.status, 200, context);
              assert.equal(response.body.caseId, 34, context);
              assert.equal(response.body.findings.find((finding) => finding.code === "legalitas").status, "tercatat", context);
              assert.equal(globalThis.__clerkTestCaseReads, 1, context);
              assert.equal(globalThis.__clerkTestEvidenceReads, 1, context);
            } else {
              assert.equal(response.status, scenario.status ?? 401, context);
              assert.deepEqual(response.body, scenario.status
                ? { error: "Domain permintaan tidak diizinkan.", code: "untrusted_host" }
                : { error: "Silakan masuk untuk melanjutkan." }, context);
              assert.doesNotMatch(response.raw, /companyName|ownerId|caseId|evidence|findings|recordedCount|Perusahaan Sendiri|Bukti sendiri/i, context);
              assert.equal(globalThis.__clerkTestCaseReads, 0, context);
              assert.equal(globalThis.__clerkTestEvidenceReads, 0, context);
              assert.equal(globalThis.__clerkTestDataReads, 0, "issuer lain harus ditolak sebelum query apa pun");
            }
          }
        }
      });
    }
  } finally {
    process.env.CLERK_PUBLISHABLE_KEY = developmentKey;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
    delete globalThis.__clerkTestDataReads;
  }
});

test("payload pemilik yang diubah setelah ditandatangani ditolak sebelum membaca data", async () => {
  globalThis.__clerkTestCases = [
    { id: 34, ownerId: "owner-a", companyName: "Perusahaan Rahasia" },
  ];
  globalThis.__clerkTestEvidence = [
    { id: 1, caseId: 34, title: "Bukti rahasia" },
  ];
  globalThis.__clerkTestCaseReads = 0;
  globalThis.__clerkTestEvidenceReads = 0;

  // The signature is valid for owner-b, but the unchanged signature must not
  // authenticate a payload rewritten to match the owner of case 34.
  const [header, encodedPayload, signature] = sessionToken("owner-b").split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.equal(payload.sub, "owner-b");
  const alteredPayload = Buffer.from(JSON.stringify({ ...payload, sub: "owner-a" })).toString("base64url");
  assert.notEqual(alteredPayload, encodedPayload);
  const tamperedToken = `${header}.${alteredPayload}.${signature}`;

  const server = app.listen(0);
  try {
    for (const headers of [
      { authorization: `Bearer ${tamperedToken}` },
      { cookie: `__session=${tamperedToken}; __client_uat=${Math.floor(Date.now() / 1000) - 1}; __clerk_db_jwt=local-dev-browser` },
    ]) {
      const response = await request(server, 34, headers);
      assert.equal(response.status, 401, response.raw);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
      assert.doesNotMatch(response.raw, /Perusahaan Rahasia|Bukti rahasia|owner-a|caseId|evidence|findings/i);
      assert.equal(globalThis.__clerkTestCaseReads, 0, "permohonan tidak boleh dibaca");
      assert.equal(globalThis.__clerkTestEvidenceReads, 0, "bukti tidak boleh dibaca");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
  }
});

test("header token yang diubah setelah ditandatangani ditolak sebelum membaca data", async () => {
  globalThis.__clerkTestCases = [
    { id: 34, ownerId: "owner-a", companyName: "Perusahaan Rahasia" },
  ];
  globalThis.__clerkTestEvidence = [
    { id: 1, caseId: 34, title: "Bukti rahasia" },
  ];
  globalThis.__clerkTestCaseReads = 0;
  globalThis.__clerkTestEvidenceReads = 0;

  const now = Math.floor(Date.now() / 1000);
  const [encodedHeader, encodedPayload, signature] = sessionToken("owner-a").split(".");
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.equal(claims.iss, "https://example.clerk.accounts.dev");
  assert.equal(claims.sub, "owner-a");
  assert.ok(claims.nbf <= now && claims.exp > now, "token masih berlaku");
  assert.ok(createVerify("RSA-SHA256").update(`${encodedHeader}.${encodedPayload}`).end()
    .verify(publicKey, Buffer.from(signature, "base64url")), "tanda tangan token asli sah");

  // Change only kid: keep the correct owner, issuer, lifetime and signature.
  const alteredHeader = Buffer.from(JSON.stringify({ ...header, kid: "altered-local-test" })).toString("base64url");
  assert.notEqual(alteredHeader, encodedHeader);
  const tamperedToken = `${alteredHeader}.${encodedPayload}.${signature}`;
  assert.equal(createVerify("RSA-SHA256").update(`${alteredHeader}.${encodedPayload}`).end()
    .verify(publicKey, Buffer.from(signature, "base64url")), false, "header baru tidak ditandatangani ulang");

  const server = app.listen(0);
  try {
    for (const headers of [
      { authorization: `Bearer ${tamperedToken}` },
      { cookie: `__session=${tamperedToken}; __client_uat=${now - 1}; __clerk_db_jwt=local-dev-browser` },
    ]) {
      const response = await request(server, 34, headers);
      assert.equal(response.status, 401, response.raw);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
      assert.doesNotMatch(response.raw, /Perusahaan Rahasia|Bukti rahasia|owner-a|caseId|evidence|findings/i);
      assert.equal(globalThis.__clerkTestCaseReads, 0, "permohonan tidak boleh dibaca");
      assert.equal(globalThis.__clerkTestEvidenceReads, 0, "bukti tidak boleh dibaca");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
  }
});

test("formulir akun lama ditolak untuk semua mutasi dengan cookie Clerk akun baru, sebelum akses data", async () => {
  const server = app.listen(0);
  const writes = [
    ["PATCH", "/api/me"],
    ["POST", "/api/cases"],
    ["PATCH", "/api/cases/34"],
    ["DELETE", "/api/cases/34"],
    ["POST", "/api/cases/34/evidence"],
    ["PATCH", "/api/cases/34/evidence/1"],
    ["DELETE", "/api/cases/34/evidence/1"],
    ["PUT", "/api/transition-verifications/transisi"],
  ];
  const tokenB = sessionToken("owner-b");
  const cookie = `__session=${tokenB}; __client_uat=${Math.floor(Date.now() / 1000) - 1}; __clerk_db_jwt=local-dev-browser`;
  try {
    for (const [method, path] of writes) {
      for (const formOwner of ["owner-a", "", null]) {
        const before = globalThis.__clerkTestDataReads ?? 0;
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
          method,
          headers: { origin: testOrigin, cookie, ...(formOwner === null ? {} : { "X-SBU-Form-Owner": formOwner }) },
        });
        assert.equal(response.status, 409, `${method} ${path}: ${await response.text()}`);
        assert.equal(globalThis.__clerkTestDataReads ?? 0, before, "menolak sebelum membaca/menulis database");
      }
    }
    // A matching precondition is not authentication; logged-out drafts still fail.
    const signedOut = await fetch(`http://127.0.0.1:${server.address().port}/api/me`, {
      method: "PATCH", headers: { "X-SBU-Form-Owner": "owner-a" },
    });
    assert.equal(signedOut.status, 401);
    // Fresh forms under B pass the guard and reach normal input validation.
    const fresh = await fetch(`http://127.0.0.1:${server.address().port}/api/me`, {
      method: "PATCH", headers: { origin: testOrigin, cookie, "X-SBU-Form-Owner": "owner-b" },
    });
    assert.equal(fresh.status, 400, await fresh.text());
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("sesi yang diverifikasi Clerk hanya membaca penilaian dan bukti milik pemegang sesi", async () => {
  globalThis.__clerkTestCases = [
    { id: 34, ownerId: "owner-a", companyName: "Perusahaan Sendiri", requestType: "baru",
      qualification: "kecil", classification: "gedung", status: "draf", existingSbuExpiresOn: null },
    { id: 35, ownerId: "owner-b", companyName: "Perusahaan Rahasia", requestType: "baru",
      qualification: "kecil", classification: "gedung", status: "draf", existingSbuExpiresOn: null },
  ];
  globalThis.__clerkTestEvidence = [
    { id: 1, caseId: 34, code: "legalitas", title: "Legalitas", note: "Bukti sendiri" },
    { id: 2, caseId: 35, code: "penjualan", title: "Rahasia", note: "Bukti rahasia" },
  ];
  globalThis.__clerkTestCaseReads = 0;
  globalThis.__clerkTestEvidenceReads = 0;

  const server = app.listen(0);
  try {
    const tokenA = sessionToken("owner-a");
    const claims = JSON.parse(Buffer.from(tokenA.split(".")[1], "base64url").toString("utf8"));
    assert.equal(claims.azp, testOrigin, "origin aplikasi harus tercantum dalam token sah");
    const headersA = { authorization: `Bearer ${tokenA}` };
    const own = await request(server, 34, headersA);
    assert.equal(own.status, 200, own.raw);
    assert.equal(own.body.caseId, 34);
    assert.equal(own.body.findings.find((finding) => finding.code === "legalitas").status, "tercatat");
    assert.equal(globalThis.__clerkTestEvidenceReads, 1, "bukti sendiri dibaca setelah otorisasi");

    const ownCookie = await request(server, 34, {
      cookie: `__session=${tokenA}; __client_uat=${Math.floor(Date.now() / 1000) - 1}; __clerk_db_jwt=local-dev-browser`,
    });
    assert.equal(ownCookie.status, 200, ownCookie.raw);
    assert.deepEqual(ownCookie.body, own.body, "sesi cookie web harus mengakses penilaian yang sama");

    const other = await request(server, 35, headersA);
    const otherCookie = await request(server, 35, {
      cookie: `__session=${tokenA}; __client_uat=${Math.floor(Date.now() / 1000) - 1}; __clerk_db_jwt=local-dev-browser`,
    });
    const missing = await request(server, 999, headersA);
    assert.equal(other.status, 404, other.raw);
    assert.equal(otherCookie.status, 404, otherCookie.raw);
    assert.equal(missing.status, 404, missing.raw);
    assert.equal(other.raw, missing.raw, "permohonan lain harus tampak seperti yang tidak ada");
    assert.equal(otherCookie.raw, missing.raw, "cookie pemilik lain tidak boleh melihat permohonan");
    assert.deepEqual(other.body, { error: "Permohonan tidak ditemukan." });
    assert.equal(globalThis.__clerkTestEvidenceReads, 2, "bukti milik orang lain tidak boleh dibaca");
    assert.doesNotMatch(own.raw + other.raw + otherCookie.raw,
      /Perusahaan Rahasia|Bukti rahasia|owner-b|"caseId":35/);

    const secondOwner = await request(server, 35, { authorization: `Bearer ${sessionToken("owner-b")}`, "X-SBU-Form-Owner": "owner-b" });
    assert.equal(secondOwner.status, 200, secondOwner.raw);
    assert.equal(secondOwner.body.caseId, 35);
    assert.equal(secondOwner.body.findings.find((finding) => finding.code === "penjualan").status, "tercatat");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
  }
});