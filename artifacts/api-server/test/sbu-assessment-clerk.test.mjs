import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createSign, generateKeyPairSync } from "node:crypto";
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
          export const profilesTable = { userId: "userId" };
          export const db = {
            select() {
              return {
                from(table) {
                  return {
                    where(predicate) {
                      if (table === casesTable) globalThis.__clerkTestCaseReads++;
                      if (table === evidenceTable) globalThis.__clerkTestEvidenceReads++;
                      const rows = table === casesTable ? globalThis.__clerkTestCases :
                        table === evidenceTable ? globalThis.__clerkTestEvidence : [];
                      return Promise.resolve(rows.filter(predicate));
                    }
                  };
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