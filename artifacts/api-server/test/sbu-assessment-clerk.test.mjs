import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
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

// Bundle the actual Express app and SBU router. Clerk's middleware and getAuth
// remain real; only persistence is replaced, so a rejected request cannot query
// the project's database or require access to it.
await build({
  entryPoints: [join(testDir, "../src/app.ts")],
  outfile: join(temporaryDir, "app.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@clerk/*", "express", "pino", "pino-http", "cors", "http-proxy-middleware", "drizzle-orm"],
  plugins: [{
    name: "isolated-persistence",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "isolated" }));
      builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
        path: join(testDir, "../../../lib/api-zod/src/index.ts"),
      }));
      builder.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({
        contents: `
          export const db = new Proxy({}, {
            get() {
              globalThis.__clerkTestDbReads = (globalThis.__clerkTestDbReads ?? 0) + 1;
              throw new Error("unauthenticated request reached persistence");
            }
          });
          export const casesTable = {};
          export const evidenceTable = {};
          export const profilesTable = {};
        `,
        loader: "js",
      }));
    },
  }],
});

const { default: app } = await import(join(temporaryDir, "app.mjs"));

test("cookie dan bearer sesi palsu tidak membuka penilaian melalui middleware Clerk", async () => {
  globalThis.__clerkTestDbReads = 0;
  const forgedJwt = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: "case-owner", exp: 4102444800 })).toString("base64url"),
  ].join(".");
  const server = app.listen(0);
  try {
    const { port } = server.address();
    for (const headers of [
      { cookie: `__session=${forgedJwt}` },
      { authorization: `Bearer ${forgedJwt}` },
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/cases/34/assessment`, { headers });
      const raw = await response.text();
      assert.equal(response.status, 401, raw);
      assert.deepEqual(JSON.parse(raw), { error: "Silakan masuk untuk melanjutkan." });
      assert.doesNotMatch(raw, /companyName|ownerId|caseId|evidence|findings|recordedCount|Perusahaan Rahasia|Bukti rahasia|Temuan rahasia/i,
        "respons tidak boleh memuat permohonan, bukti, atau temuan");
      assert.equal(globalThis.__clerkTestDbReads, 0, "Clerk harus menolak sebelum membaca data");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__clerkTestDbReads;
  }
});