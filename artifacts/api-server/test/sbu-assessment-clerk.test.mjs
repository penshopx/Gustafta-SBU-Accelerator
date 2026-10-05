import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const temporaryDir = await mkdtemp(join(testDir, ".sbu-clerk-test-"));
after(() => rm(temporaryDir, { recursive: true, force: true }));

// Never use the workspace's real Clerk credentials, even when they are present.
// This key is only a syntactically valid test key; no Clerk account is involved.
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`;
process.env.CLERK_SECRET_KEY = "sk_test_not_a_real_secret";
process.env.NODE_ENV = "test";
process.env.CLERK_TELEMETRY_DISABLED = "1";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.CLERK_JWT_KEY = publicKey.export({ type: "spki", format: "pem" });

function sessionToken(userId, times = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "local-test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: userId, sid: `session-${userId}`, iss: "https://example.clerk.accounts.dev",
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
  external: ["@clerk/*", "express", "pino", "pino-http", "cors", "http-proxy-middleware"],
  plugins: [{
    name: "isolated-persistence",
    setup(builder) {
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
        ` : `
          export const casesTable = { id: "id", ownerId: "ownerId" };
          export const evidenceTable = { caseId: "caseId" };
          export const transitionVerificationsTable = { track: "track" };
          export const profilesTable = { userId: "userId" };
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

async function request(server, id, headers) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/cases/${id}/assessment`, { headers });
  const raw = await response.text();
  return { status: response.status, raw, body: JSON.parse(raw) };
}

// Node fetch replaces a supplied Host with the URL's hostname. Keep the
// connection local while sending the public Host verbatim for domain tests.
function requestWithHost(server, id, headers) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1", port: server.address().port,
      path: `/api/cases/${id}/assessment`, headers,
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

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "127.0.0.1") throw new Error(`Unexpected outbound request: ${url.hostname}`);
    return originalFetch(input, init);
  };
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
    globalThis.fetch = originalFetch;
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

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "127.0.0.1") throw new Error(`Unexpected outbound request: ${url.hostname}`);
    return originalFetch(input, init);
  };
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
    globalThis.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
  }
});

test("domain Clerk dipilih sesuai host/proxy dan issuer lain ditolak tanpa membaca data", async (t) => {
  const developmentKey = process.env.CLERK_PUBLISHABLE_KEY;
  const originalFetch = globalThis.fetch;
  globalThis.__clerkTestCases = [
    { id: 34, ownerId: "owner-a", companyName: "Perusahaan Sendiri", requestType: "baru",
      qualification: "kecil", classification: "gedung", status: "draf", existingSbuExpiresOn: null },
  ];
  globalThis.__clerkTestEvidence = [
    { id: 1, caseId: 34, code: "legalitas", title: "Legalitas", note: "Bukti sendiri" },
  ];
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "127.0.0.1") throw new Error(`Unexpected outbound request: ${url.hostname}`);
    return originalFetch(input, init);
  };
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
      headers: { host: alternateHost, "x-forwarded-host": primaryHost }, issuer: primaryIssuer },
    { label: "proxy memilih domain alternatif di atas Host utama", key: productionKey,
      headers: { host: primaryHost, "x-forwarded-host": alternateHost }, issuer: alternateIssuer },
    { label: "hop pertama proxy memilih domain utama", key: productionKey,
      headers: { host: alternateHost, "x-forwarded-host": ` ${primaryHost}, ${alternateHost}` }, issuer: primaryIssuer },
    { label: "hop pertama proxy memilih domain alternatif dengan port", key: productionKey,
      headers: { host: primaryHost, "x-forwarded-host": ` PENILAIAN.EXAMPLE.TEST:443 , ${primaryHost}` }, issuer: alternateIssuer },
    { label: "proxy kosong kembali ke Host", key: productionKey,
      headers: { host: alternateHost, "x-forwarded-host": "" }, issuer: alternateIssuer },
    { label: "key pengembangan tetap berlaku pada Host alternatif", key: developmentKey,
      headers: { host: alternateHost }, issuer: developmentIssuer },
    { label: "key pengembangan tetap berlaku di belakang proxy", key: developmentKey,
      headers: { host: primaryHost, "x-forwarded-host": `${alternateHost}, ${primaryHost}` }, issuer: developmentIssuer },
  ];
  try {
    for (const scenario of scenarios) {
      await t.test(scenario.label, async () => {
        process.env.CLERK_PUBLISHABLE_KEY = scenario.key;
        // Both legitimate domain issuers must be tried for every host: this
        // catches a key accidentally fixed to one domain or to the last hop.
        for (const issuer of [primaryIssuer, alternateIssuer, developmentIssuer, unrelatedIssuer]) {
          const token = sessionToken("owner-a", { iss: issuer });
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
            const response = await requestWithHost(server, 34, { ...scenario.headers, ...authHeaders });
            const context = `${scenario.label}, ${issuer}, ${Object.keys(authHeaders)[0]}: ${response.raw}`;
            if (issuer === scenario.issuer) {
              assert.equal(response.status, 200, context);
              assert.equal(response.body.caseId, 34, context);
              assert.equal(response.body.findings.find((finding) => finding.code === "legalitas").status, "tercatat", context);
              assert.equal(globalThis.__clerkTestCaseReads, 1, context);
              assert.equal(globalThis.__clerkTestEvidenceReads, 1, context);
            } else {
              assert.equal(response.status, 401, context);
              assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." }, context);
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
    globalThis.fetch = originalFetch;
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

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "127.0.0.1") throw new Error(`Unexpected outbound request: ${url.hostname}`);
    return originalFetch(input, init);
  };
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
    globalThis.fetch = originalFetch;
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

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "127.0.0.1") throw new Error(`Unexpected outbound request: ${url.hostname}`);
    return originalFetch(input, init);
  };
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
    globalThis.fetch = originalFetch;
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
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "127.0.0.1") throw new Error(`Unexpected outbound request: ${url.hostname}`);
    return originalFetch(input, init);
  };
  try {
    for (const [method, path] of writes) {
      for (const formOwner of ["owner-a", "", null]) {
        const before = globalThis.__clerkTestDataReads ?? 0;
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
          method,
          headers: { cookie, ...(formOwner === null ? {} : { "X-SBU-Form-Owner": formOwner }) },
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
      method: "PATCH", headers: { cookie, "X-SBU-Form-Owner": "owner-b" },
    });
    assert.equal(fresh.status, 400, await fresh.text());
  } finally {
    globalThis.fetch = originalFetch;
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

  // Fail closed on unexpected network traffic (including Clerk API/JWKS).
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "127.0.0.1") throw new Error(`Unexpected outbound request: ${url.hostname}`);
    return originalFetch(input, init);
  };
  const server = app.listen(0);
  try {
    const tokenA = sessionToken("owner-a");
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

    const secondOwner = await request(server, 35, { authorization: `Bearer ${sessionToken("owner-b")}` });
    assert.equal(secondOwner.status, 200, secondOwner.raw);
    assert.equal(secondOwner.body.caseId, 35);
    assert.equal(secondOwner.body.findings.find((finding) => finding.code === "penjualan").status, "tercatat");
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestCases;
    delete globalThis.__clerkTestEvidence;
    delete globalThis.__clerkTestCaseReads;
    delete globalThis.__clerkTestEvidenceReads;
  }
});