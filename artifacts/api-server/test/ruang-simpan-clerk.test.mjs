import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createSign, generateKeyPairSync } from "node:crypto";
import { request as nodeHttpRequest } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const temporaryDir = await mkdtemp(join(testDir, ".ruang-simpan-clerk-test-"));
after(() => rm(temporaryDir, { recursive: true, force: true }));

// Never use or inspect workspace Clerk credentials. All credentials below are
// generated/defined solely for this isolated test process.
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`;
process.env.CLERK_SECRET_KEY = "sk_test_not_a_real_secret";
process.env.NODE_ENV = "test";
process.env.CLERK_TELEMETRY_DISABLED = "1";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.CLERK_JWT_KEY = publicKey.export({ type: "spki", format: "pem" });

const ownerAToken = "ruang-simpan-test-credential-owner-a";
const ownerBToken = "ruang-simpan-test-credential-owner-b";
process.env.RUANG_SIMPAN_CONNECTIONS = JSON.stringify({
  "ruang-owner-a": "RUANG_SIMPAN_TOKEN_TEST_OWNER_A",
  "ruang-owner-b": "RUANG_SIMPAN_TOKEN_TEST_OWNER_B",
});
process.env.RUANG_SIMPAN_TOKEN_TEST_OWNER_A = ownerAToken;
process.env.RUANG_SIMPAN_TOKEN_TEST_OWNER_B = ownerBToken;

const upstreamUrl = "https://gustafta-apps.replit.app/api/v1/ruang-simpan/company-profile";
const ownerAProfile = {
  name: "PT Contoh Owner A",
  nib: "1234567890123",
  address: "Alamat Owner A",
  revision: 7,
  updated_at: "2025-01-02T03:04:05Z",
};
const ownerBProfile = {
  name: "PT Contoh Owner B",
  nib: "9876543210987",
  address: "Alamat Owner B",
  revision: 12,
  updated_at: "2025-02-03T04:05:06Z",
};
const upstreamCalls = [];

function sessionToken(userId, times = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "local-test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    sid: `session-${userId}`,
    iss: "https://example.clerk.accounts.dev",
    iat: now,
    nbf: now - 1,
    exp: now + 300,
    ...times,
  })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(input).end().sign(privateKey).toString("base64url");
  return `${input}.${signature}`;
}

// Bundle the actual app, route, and Clerk middleware. Persistence, logging,
// and the proxy are isolated; Clerk's middleware and getAuth remain real.
await build({
  entryPoints: [join(testDir, "../src/app.ts")],
  outfile: join(temporaryDir, "app.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@clerk/*", "express", "cors"],
  plugins: [{
    name: "isolated-test-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "isolated" }));
      builder.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: "sql", namespace: "isolated" }));
      builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
        path: join(testDir, "../../../lib/api-zod/src/index.ts"),
      }));
      builder.onResolve({ filter: /^\.\/lib\/logger$/ }, () => ({ path: "logger", namespace: "isolated" }));
      builder.onResolve({ filter: /^\.\/middlewares\/clerkProxyMiddleware$/ }, () => ({
        path: "proxy",
        namespace: "isolated",
      }));
      builder.onResolve({ filter: /^pino-http$/ }, () => ({ path: "pino-http", namespace: "isolated" }));
      builder.onLoad({ filter: /.*/, namespace: "isolated" }, (args) => ({
        contents: args.path === "sql" ? `
          export const eq = (field, value) => (row) => row[field] === value;
          export const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
          export const desc = () => { throw new Error("unexpected ordering"); };
        ` : args.path === "db" ? `
          export const casesTable = { id: "id", ownerId: "ownerId" };
          export const evidenceTable = { caseId: "caseId" };
          export const transitionVerificationsTable = { track: "track" };
          export const profilesTable = { userId: "userId" };
          export const db = {
            select() {
              return {
                from(table) {
                  return Object.assign(Promise.resolve([]), {
                    where() { return Promise.resolve([]); }
                  });
                }
              };
            }
          };
        ` : args.path === "proxy" ? `
          export const CLERK_PROXY_PATH = "/__clerk";
          export const getClerkProxyHost = () => undefined;
          export const clerkProxyMiddleware = () => (_req, _res, next) => next();
        ` : args.path === "pino-http" ? `
          export default () => (_req, _res, next) => next();
        ` : `
          export const logger = {};
        `,
        loader: "js",
      }));
    },
  }],
});

const { default: app } = await import(join(temporaryDir, "app.mjs"));

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return originalFetch(input, init);
  }
  if (url.href !== upstreamUrl) {
    throw new Error(`Unexpected outbound request: ${url.hostname}`);
  }

  const authorization = new Headers(init.headers).get("authorization");
  upstreamCalls.push({ url: url.href, authorization });
  const profile = authorization === `Bearer ${ownerAToken}` ? ownerAProfile :
    authorization === `Bearer ${ownerBToken}` ? ownerBProfile : null;
  if (!profile) return new Response(null, { status: 401 });
  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = originalFetch;
});

async function request(server, options = {}) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/ruang-simpan/company-profile`, options);
  const raw = await response.text();
  return { status: response.status, raw, body: JSON.parse(raw), cacheControl: response.headers.get("cache-control") };
}

async function requestGetWithBody(port, body, headers) {
  return new Promise((resolve, reject) => {
    const outgoing = nodeHttpRequest({
      hostname: "127.0.0.1",
      port,
      path: "/api/ruang-simpan/company-profile",
      method: "GET",
      headers: {
        ...headers,
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        raw,
        body: JSON.parse(raw),
        cacheControl: response.headers["cache-control"],
      }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

function assertPrivateNoStore(response) {
  assert.equal(response.cacheControl, "private, no-store", "hasil profil tidak boleh disimpan");
}

async function withServer(callback) {
  const server = app.listen(0);
  try {
    await callback(server);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("token palsu, kedaluwarsa, dan penerbit yang salah ditolak tanpa fetch upstream", async () => {
  upstreamCalls.length = 0;
  const now = Math.floor(Date.now() / 1000);
  const forgedToken = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: "ruang-owner-a", exp: now + 300 })).toString("base64url"),
  ].join(".");
  const expiredToken = sessionToken("ruang-owner-a", {
    iat: now - 1200,
    nbf: now - 1200,
    exp: now - 600,
  });
  const wrongIssuerToken = sessionToken("ruang-owner-a", {
    iss: "https://other.clerk.accounts.dev",
  });

  await withServer(async (server) => {
    for (const token of [forgedToken, expiredToken, wrongIssuerToken]) {
      const response = await request(server, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 401, response.raw);
      assertPrivateNoStore(response);
      assert.doesNotMatch(response.raw, /ruang-owner-a|Contoh Owner|1234567890123|credential/i);
    }
  });

  assert.equal(upstreamCalls.length, 0, "token yang ditolak tidak boleh memicu fetch upstream");
});

test("sesi Clerk terverifikasi mengambil profil dengan kredensial yang terikat ke pemiliknya", async () => {
  upstreamCalls.length = 0;
  await withServer(async (server) => {
    const ownerA = await request(server, {
      headers: { authorization: `Bearer ${sessionToken("ruang-owner-a")}` },
    });
    assert.equal(ownerA.status, 200, ownerA.raw);
    assertPrivateNoStore(ownerA);
    assert.deepEqual(ownerA.body, { userId: "ruang-owner-a", profile: ownerAProfile });

    const ownerB = await request(server, {
      headers: { authorization: `Bearer ${sessionToken("ruang-owner-b")}` },
    });
    assert.equal(ownerB.status, 200, ownerB.raw);
    assertPrivateNoStore(ownerB);
    assert.deepEqual(ownerB.body, { userId: "ruang-owner-b", profile: ownerBProfile });
  });

  assert.deepEqual(
    upstreamCalls.map(({ url, authorization }) => ({ url, authorization })),
    [
      { url: upstreamUrl, authorization: `Bearer ${ownerAToken}` },
      { url: upstreamUrl, authorization: `Bearer ${ownerBToken}` },
    ],
  );
  assert.doesNotMatch(JSON.stringify(upstreamCalls), /ruang-owner-a|ruang-owner-b/);
});

test("pengguna tanpa pemetaan menerima 404 tanpa fetch upstream", async () => {
  upstreamCalls.length = 0;
  await withServer(async (server) => {
    const response = await request(server, {
      headers: { authorization: `Bearer ${sessionToken("ruang-owner-unmapped")}` },
    });
    assert.equal(response.status, 404, response.raw);
    assertPrivateNoStore(response);
    assert.deepEqual(response.body, {
      error: "Koneksi Ruang Simpan belum dikonfigurasi",
      code: "connection_not_configured",
    });
  });
  assert.equal(upstreamCalls.length, 0, "pengguna tanpa pemetaan tidak boleh memicu fetch upstream");
});

test("parameter kueri maupun body tidak dapat mengganti pemilik dan tidak memicu fetch", async () => {
  upstreamCalls.length = 0;
  await withServer(async (server) => {
    const token = sessionToken("ruang-owner-a");
    const { port } = server.address();
    const queryResponse = await fetch(
      `http://127.0.0.1:${port}/api/ruang-simpan/company-profile?ownerId=ruang-owner-b`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const queryRaw = await queryResponse.text();
    assert.equal(queryResponse.status, 400, queryRaw);
    assert.equal(queryResponse.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(JSON.parse(queryRaw), {
      error: "Parameter kueri dan isi permintaan tidak diperbolehkan",
      code: "invalid_request",
    });

    const bodyResponse = await requestGetWithBody(port, JSON.stringify({ ownerId: "ruang-owner-b" }), {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    });
    assert.equal(bodyResponse.status, 400, bodyResponse.raw);
    assertPrivateNoStore(bodyResponse);
    assert.deepEqual(bodyResponse.body, {
      error: "Parameter kueri dan isi permintaan tidak diperbolehkan",
      code: "invalid_request",
    });
  });
  assert.equal(upstreamCalls.length, 0, "permintaan dengan parameter atau body tidak boleh memicu fetch");
});

test("JSON rusak menghasilkan galat tersanitasi tanpa menggemakan body dan tanpa cache", async () => {
  upstreamCalls.length = 0;
  const marker = "DO_NOT_ECHO_OWNER_OVERRIDE";
  await withServer(async (server) => {
    const { port } = server.address();
    const response = await requestGetWithBody(port, `{"ownerId":"${marker}"`, {
      authorization: `Bearer ${sessionToken("ruang-owner-a")}`,
      "content-type": "application/json",
    });
    assert.equal(response.status, 400, response.raw);
    assertPrivateNoStore(response);
    assert.deepEqual(response.body, {
      error: "Parameter kueri dan isi permintaan tidak diperbolehkan",
      code: "invalid_request",
    });
    assert.doesNotMatch(response.raw, new RegExp(marker));
    assert.doesNotMatch(response.raw, /SyntaxError|entity\.parse\.failed|stack|ownerId/i);
  });
  assert.equal(upstreamCalls.length, 0, "JSON rusak tidak boleh memicu fetch upstream");
});