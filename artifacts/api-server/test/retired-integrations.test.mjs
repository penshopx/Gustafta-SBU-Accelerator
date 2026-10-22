import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createSign, generateKeyPairSync } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import net from "node:net";
import { build } from "esbuild";
import { parse } from "yaml";

const testDir = fileURLToPath(new URL(".", import.meta.url));
let temporaryDir;
let server;
let localPort;
const originalFetch = globalThis.fetch;
const originalConnect = net.Socket.prototype.connect;
const outboundAttempts = [];
function forbidOutbound(transport) {
  outboundAttempts.push(transport);
  throw new Error("Outbound requests are forbidden in retirement tests");
}
// Install before importing the app/SDK. Only the test's own HTTP server may be
// reached, using a literal address and its assigned port (no DNS or redirects).
globalThis.fetch = async () => forbidOutbound("fetch");
net.Socket.prototype.connect = function (...args) {
  // Node's HTTP agent supplies normalized [options, callback] connect arguments.
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (!localPort || typeof options !== "object"
    || options.host !== "127.0.0.1" || Number(options.port) !== localPort
    || options.path) {
    return forbidOutbound("socket");
  }
  return originalConnect.apply(this, args);
};
syncBuiltinESMExports();
afterEach(() => assert.deepEqual(outboundAttempts, [], "No caught outbound attempt may be hidden"));
after(async () => {
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
    }
    if (temporaryDir) await rm(temporaryDir, { recursive: true, force: true });
  } finally {
    globalThis.fetch = originalFetch;
    net.Socket.prototype.connect = originalConnect;
    syncBuiltinESMExports();
    delete globalThis.__retirementAuthCalls;
    delete globalThis.__retirementDatabaseCalls;
    assert.deepEqual(outboundAttempts, []);
  }
});
temporaryDir = await mkdtemp(join(testDir, ".retired-integrations-"));

// No workspace credentials are read. The obsolete opt-in is deliberately on,
// with an entirely synthetic mapping, to catch accidental reactivation.
process.env.SBU_RUANG_SIMPAN_ENABLED = "true";
process.env.RUANG_SIMPAN_CONNECTIONS = JSON.stringify({ "test-owner": "RUANG_SIMPAN_TOKEN_RETIREMENT_FIXTURE" });
process.env.RUANG_SIMPAN_TOKEN_RETIREMENT_FIXTURE = "synthetic-not-a-real-token";
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`;
process.env.CLERK_SECRET_KEY = "sk_test_not_a_real_secret";
process.env.CLERK_TELEMETRY_DISABLED = "1";
process.env.NODE_ENV = "test";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.CLERK_JWT_KEY = publicKey.export({ type: "spki", format: "pem" });
const testOrigin = "http://sbu.example.test";
function sessionToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "retirement-local" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "test-owner", sid: "session-retirement-fixture",
    iss: "https://example.clerk.accounts.dev", azp: testOrigin,
    iat: now, nbf: now - 1, exp: now + 300, ...overrides,
  })).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${createSign("RSA-SHA256").update(input).end().sign(privateKey).toString("base64url")}`;
}
const now = Math.floor(Date.now() / 1000);
const sessions = [{ label: "missing", headers: {}, expectedStatus: 401 }];
for (const [label, token] of [
  ["valid", sessionToken()],
  ["expired", sessionToken({ iat: now - 1200, nbf: now - 1200, exp: now - 600 })],
  ["wrong issuer", sessionToken({ iss: "https://other.clerk.accounts.dev" })],
]) {
  for (const [transport, headers] of [
    ["bearer", { authorization: `Bearer ${token}` }],
    ["cookie", { cookie: `__session=${token}; __client_uat=${now - 1}; __clerk_db_jwt=local-dev-browser` }],
  ]) {
    sessions.push({ label: `${label} ${transport}`, headers, expectedStatus: label === "valid" ? 200 : 401 });
  }
}
const clerkModulePath = createRequire(import.meta.url).resolve("@clerk/express");

globalThis.__retirementAuthCalls = 0;
globalThis.__retirementDatabaseCalls = 0;
await build({
  entryPoints: [join(testDir, "../src/app.ts")],
  outfile: join(temporaryDir, "app.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@clerk/*", "@google-cloud/*", "express", "cors"],
  plugins: [{
    name: "isolated-dependencies",
    setup(builder) {
      const mocks = {
        "@clerk/express": `
          export * from ${JSON.stringify(clerkModulePath)};
          import { clerkMiddleware as realClerkMiddleware } from ${JSON.stringify(clerkModulePath)};
          export const clerkMiddleware = (...options) => {
            const middleware = realClerkMiddleware(...options);
            return (req, res, next) => {
              globalThis.__retirementAuthCalls++;
              return middleware(req, res, next);
            };
          };
        `,
        "@workspace/db": `
          export const casesTable = {}, evidenceTable = {}, profilesTable = {};
          export const companyProfilesTable = {}, documentsTable = {}, documentAnalysesTable = {}, documentAnalysisOperationsTable = {};
          export const transitionVerificationsTable = {}, appSettingsTable = {};
          export const auditLogsTable = {}, clientsTable = {}, workspacesTable = {};
          export const consultationsTable = {}, personnelTable = {}, skkCertificatesTable = {};
          export const workroomItemsTable = {}, workroomReviewsTable = {};
          export const db = new Proxy({}, { get() {
            globalThis.__retirementDatabaseCalls++;
            throw new Error("Unexpected database access");
          }});
        `,
        "./lib/logger": "export const logger = {};",
        "pino-http": "export default () => (req, _res, next) => { req.log = { warn() {} }; next(); };",
        "./middlewares/clerkRequestOrigin": "export const clerkRequestOriginMiddleware = () => (_req, _res, next) => next();",
        "./middlewares/clerkProxyMiddleware": `
          export const CLERK_PROXY_PATH = "/__clerk";
          export const getClerkProxyHost = () => undefined;
          export const clerkProxyMiddleware = () => (_req, _res, next) => next();
        `,
      };
      builder.onResolve({ filter: /.*/ }, (args) => args.path === clerkModulePath
        ? { path: args.path, external: true }
        : args.path in mocks ? { path: args.path, namespace: "retirement-mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "retirement-mock" }, (args) => ({
        contents: mocks[args.path], loader: "js",
      }));
    },
  }],
});

const { default: app } = await import(join(temporaryDir, "app.mjs"));
const { getAuth } = await import("@clerk/express");
// Test-only positive control: traverses the actual app's middleware/issuer gate
// without reading persistence. A valid session must demonstrably authenticate.
app.get("/retirement-session-control", (req, res) => {
  const { userId } = getAuth(req);
  res.status(userId ? 200 : 401).json({ userId });
});
server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
localPort = server.address().port;

function request(path, method = "GET", body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: server.address().port, path, method,
      headers: {
        origin: testOrigin,
        ...headers,
        ...(body === undefined ? {} : {
          "content-type": "application/json", "content-length": Buffer.byteLength(body),
        }),
      },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, raw }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("real Clerk accepts only the valid synthetic sessions through the app authentication gate", async () => {
  for (const session of sessions) {
    const before = globalThis.__retirementAuthCalls;
    const response = await request("/retirement-session-control", "GET", undefined, session.headers);
    assert.equal(response.status, session.expectedStatus, `${session.label}: ${response.raw}`);
    assert.equal(globalThis.__retirementAuthCalls, before + 1, session.label);
    if (session.expectedStatus === 200) assert.equal(JSON.parse(response.raw).userId, "test-owner");
  }
  assert.equal(globalThis.__retirementDatabaseCalls, 0);
});

test("retired API rejects every session and method before real Clerk, parsing, database, or upstream, regardless of old opt-in", async () => {
  const authCallsBefore = globalThis.__retirementAuthCalls;
  for (const flag of ["true", "false", undefined]) {
    if (flag === undefined) delete process.env.SBU_RUANG_SIMPAN_ENABLED;
    else process.env.SBU_RUANG_SIMPAN_ENABLED = flag;
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
      for (const path of [
        "/api/ruang-simpan/company-profile",
        "/api/ruang-simpan/company-profile/?ownerId=test-owner",
        "/api/ruang-simpan",
        "/api/ruang-simpan/other",
        "/api/RUANG-SIMPAN/company-profile",
      ]) {
        for (const session of sessions) {
          const response = await request(path, method, '{"invalid":', session.headers);
          assert.equal(response.status, 410, `${session.label}, flag=${flag}, ${method} ${path}: ${response.raw}`);
          assert.equal(response.headers["cache-control"], "private, no-store");
          if (method !== "HEAD") {
            assert.equal(JSON.parse(response.raw).code, "integration_cancelled");
            assert.doesNotMatch(response.raw, /test-owner|synthetic-not-a-real-token|SyntaxError/);
          }
          assert.equal(globalThis.__retirementAuthCalls, authCallsBefore, session.label);
        }
      }
    }
  }
  assert.equal(globalThis.__retirementAuthCalls, authCallsBefore);
  assert.equal(globalThis.__retirementDatabaseCalls, 0);
});

test("local profile and document endpoints still reach their own authentication gate", async () => {
  const authCallsBefore = globalThis.__retirementAuthCalls;
  for (const path of ["/api/company-profile", "/api/documents", "/api/cases/1/documents"]) {
    assert.equal((await request(path)).status, 401, path);
  }
  assert.equal(globalThis.__retirementAuthCalls, authCallsBefore + 3);
  assert.equal(globalThis.__retirementDatabaseCalls, 0);
});

test("active contract and frontend retain local profile/documents, not legacy integration callers", async () => {
  const root = join(testDir, "../../..");
  const contract = parse(await readFile(join(root, "lib/api-spec/openapi.yaml"), "utf8"));
  assert.ok(contract.paths["/company-profile"].get);
  assert.ok(contract.paths["/company-profile"].put);
  assert.ok(contract.paths["/documents"].get);
  assert.equal(contract.paths["/ruang-simpan/company-profile"], undefined);
  assert.equal(contract.components.schemas.RuangSimpanCompanyProfile, undefined);
  const client = await readFile(join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");
  assert.doesNotMatch(client, /RuangSimpan|ruang-simpan/);
  assert.match(client, /useGetLocalCompanyProfile/);
  assert.match(client, /usePutLocalCompanyProfile/);
  const ui = await readFile(join(root, "artifacts/gustafta-sbu/src/App.tsx"), "utf8");
  assert.match(ui, /path="\/company-profile".*<LocalCompanyProfilePage/);
  assert.match(ui, /path="\/documents".*<DocumentVaultPage/);
});
