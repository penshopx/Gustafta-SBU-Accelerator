import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/node-postgres";

const testDir = fileURLToPath(new URL("../", import.meta.url));
const dbDir = resolve(testDir, "../../../lib/db/src");

// Both PostgreSQL fixtures and their database-free preflights must use exactly
// the same bundle substitutions, including all real subrouters.
export async function buildCaseRouteFixture(temporaryDir, dbGlobal) {
  const result = await build({
    entryPoints: [join(testDir, "../src/routes/sbu.ts")],
    outfile: join(temporaryDir, "route.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    metafile: true,
    external: ["express", "@google-cloud/*"],
    plugins: [{
      name: "isolated-case-db",
      setup(builder) {
        builder.onResolve({ filter: /\/workspace-context$/ }, () => ({
          path: join(testDir, "helpers/workspace-context-fixture.mjs"),
        }));
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "case-test" }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "case-test" }));
        builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
          path: resolve(testDir, "../../../lib/api-zod/src/index.ts"),
        }));
        builder.onLoad({ filter: /.*/, namespace: "case-test" }, (args) => ({
          contents: args.path === "auth"
            ? `export const getAuth = (req) => ({ userId: req.get("x-test-user-id") });`
            : `export * from ${JSON.stringify(join(dbDir, "schema/index.ts"))};
               export const db = globalThis[${JSON.stringify(dbGlobal)}];`,
          loader: "js",
          resolveDir: testDir,
        }));
      },
    }],
  });
  const inputs = new Set(Object.keys(result.metafile.inputs).map((path) => resolve(path)));
  assert.ok(inputs.has(join(dbDir, "schema/index.ts")), "Fixture harus memuat barrel schema lengkap");
  assert.ok(!inputs.has(join(dbDir, "index.ts")), "Bootstrap koneksi database aplikasi tidak boleh dibundel");
  for (const route of [
    "sbu", "standalone", "sbu-chat", "consultations", "personnel",
    "workroom", "workroom-reviews", "document-vault", "document-analysis",
  ]) {
    assert.ok(inputs.has(resolve(testDir, `../src/routes/${route}.ts`)),
      `Fixture harus memuat rute nyata ${route}.ts`);
  }
  return import(join(temporaryDir, "route.mjs"));
}

export function caseRoutePreflight(dbGlobal) {
  // Reuse the result so a failed standalone check also blocks database setup.
  let pending;
  return () => pending ??= (async () => {
    const temporaryDir = await mkdtemp(join(testDir, ".sbu-case-bundle-"));
    let queryAttempts = 0;
    const rejectQuery = () => {
      queryAttempts += 1;
      throw new Error("Preflight rute tidak boleh menjalankan query PostgreSQL");
    };
    const connection = { query: rejectQuery, connect: rejectQuery };
    globalThis[dbGlobal] = drizzle(connection);
    try {
      assert.throws(() => connection.query("SELECT 1"), /tidak boleh menjalankan query/);
      queryAttempts = 0;
      const { default: router } = await buildCaseRouteFixture(temporaryDir, dbGlobal);
      assert.equal(typeof router, "function", "Rute SBU harus berhasil diinisialisasi");
      assert.ok(router.stack.length > 0, "Rute SBU harus mendaftarkan handler nyata");
      assert.equal(queryAttempts, 0, "Pemuatan rute tidak boleh mencoba mengakses PostgreSQL");
    } finally {
      delete globalThis[dbGlobal];
      await rm(temporaryDir, { recursive: true, force: true });
    }
  })();
}
