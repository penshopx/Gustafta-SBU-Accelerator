import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { build } from "esbuild";
import { parse } from "yaml";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const temporaryDir = await mkdtemp(join(testDir, ".retired-integrations-"));
after(() => rm(temporaryDir, { recursive: true, force: true }));

// No workspace credentials are read. The obsolete opt-in is deliberately on,
// with an entirely synthetic mapping, to catch accidental reactivation.
process.env.SBU_RUANG_SIMPAN_ENABLED = "true";
process.env.RUANG_SIMPAN_CONNECTIONS = JSON.stringify({ "test-owner": "RUANG_SIMPAN_TOKEN_RETIREMENT_FIXTURE" });
process.env.RUANG_SIMPAN_TOKEN_RETIREMENT_FIXTURE = "synthetic-not-a-real-token";
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`;

globalThis.__retirementAuthCalls = 0;
globalThis.__retirementDatabaseCalls = 0;
await build({
  entryPoints: [join(testDir, "../src/app.ts")],
  outfile: join(temporaryDir, "app.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@clerk/shared/*", "@google-cloud/*", "express", "cors"],
  plugins: [{
    name: "isolated-dependencies",
    setup(builder) {
      const mocks = {
        "@clerk/express": `
          export const clerkMiddleware = () => (_req, _res, next) => {
            globalThis.__retirementAuthCalls++;
            next();
          };
          export const getAuth = () => ({ userId: null });
        `,
        "@workspace/db": `
          export const casesTable = {}, evidenceTable = {}, profilesTable = {};
          export const companyProfilesTable = {}, documentsTable = {}, documentAnalysesTable = {};
          export const transitionVerificationsTable = {}, appSettingsTable = {};
          export const auditLogsTable = {}, clientsTable = {}, workspacesTable = {};
          export const db = new Proxy({}, { get() {
            globalThis.__retirementDatabaseCalls++;
            throw new Error("Unexpected database access");
          }});
        `,
        "./lib/logger": "export const logger = {};",
        "pino-http": "export default () => (_req, _res, next) => next();",
        "./middlewares/clerkRequestOrigin": "export const clerkRequestOriginMiddleware = () => (_req, _res, next) => next();",
        "./middlewares/clerkProxyMiddleware": `
          export const CLERK_PROXY_PATH = "/__clerk";
          export const getClerkProxyHost = () => undefined;
          export const clerkProxyMiddleware = () => (_req, _res, next) => next();
        `,
      };
      builder.onResolve({ filter: /.*/ }, (args) => args.path in mocks
        ? { path: args.path, namespace: "retirement-mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "retirement-mock" }, (args) => ({
        contents: mocks[args.path], loader: "js",
      }));
    },
  }],
});

const originalFetch = globalThis.fetch;
let outboundCalls = 0;
globalThis.fetch = async () => {
  outboundCalls++;
  throw new Error("Outbound requests are forbidden in retirement tests");
};
after(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.__retirementAuthCalls;
  delete globalThis.__retirementDatabaseCalls;
});

const { default: app } = await import(join(temporaryDir, "app.mjs"));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
after(() => new Promise((resolve, reject) =>
  server.close((error) => error ? reject(error) : resolve())));

function request(path, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: server.address().port, path, method,
      headers: {
        authorization: "Bearer invalid-synthetic-session",
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

test("retired API rejects every method before auth, body parsing, database, or upstream, regardless of old opt-in", async () => {
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
        const response = await request(path, method, '{"invalid":');
        assert.equal(response.status, 410, `${method} ${path}: ${response.raw}`);
        assert.equal(response.headers["cache-control"], "private, no-store");
        if (method !== "HEAD") {
          assert.equal(JSON.parse(response.raw).code, "integration_cancelled");
          assert.doesNotMatch(response.raw, /test-owner|synthetic-not-a-real-token|SyntaxError/);
        }
      }
    }
  }
  assert.equal(globalThis.__retirementAuthCalls, 0);
  assert.equal(globalThis.__retirementDatabaseCalls, 0);
  assert.equal(outboundCalls, 0);
});

test("local profile and document endpoints still reach their own authentication gate", async () => {
  for (const path of ["/api/company-profile", "/api/documents", "/api/cases/1/documents"]) {
    assert.equal((await request(path)).status, 401, path);
  }
  assert.equal(globalThis.__retirementAuthCalls, 3);
  assert.equal(globalThis.__retirementDatabaseCalls, 0);
  assert.equal(outboundCalls, 0);
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
