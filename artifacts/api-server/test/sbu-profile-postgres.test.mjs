import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/node-postgres";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");

async function request(server, userId) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/me`, {
    headers: userId === undefined ? {} : { "x-test-user-id": userId },
  });
  const raw = await response.text();
  return { status: response.status, body: JSON.parse(raw), raw };
}

test("GET /api/me menolak pengunjung tanpa sesi dan memisahkan dua profil di PostgreSQL", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL diperlukan untuk pengujian integrasi PostgreSQL");
  assert.notEqual(process.env.NODE_ENV, "production", "Pengujian tidak boleh dijalankan dalam mode produksi");

  const schema = `sbu_profile_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const isolated = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
    max: 2,
  });
  const temporaryDir = await mkdtemp(join(testDir, ".sbu-profile-pg-"));
  let created = false;
  let server;

  try {
    // Clone only the profile table. No test INSERT/UPDATE/DELETE targets public.
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await admin.query(`CREATE TABLE "${schema}".sbu_profiles (LIKE public.sbu_profiles INCLUDING ALL)`);

    const { rows: [target] } = await isolated.query(`
      SELECT current_schema() AS current_schema,
             (SELECT n.nspname FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.oid = to_regclass('sbu_profiles')) AS table_schema
    `);
    assert.deepEqual(target, { current_schema: schema, table_schema: schema },
      "Koneksi route harus memilih tabel sementara, bukan tabel aplikasi");

    const readProfiles = async () => (await isolated.query(
      "SELECT user_id, role, display_name, organization_name FROM sbu_profiles ORDER BY user_id",
    )).rows;

    // Only auth is replaced. The route uses the actual Drizzle query builder,
    // PostgreSQL pool and application's real profile table definition.
    globalThis.__profileTestDb = drizzle(isolated);
    await build({
      entryPoints: [join(testDir, "../src/routes/sbu.ts")],
      outfile: join(temporaryDir, "route.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      external: ["express"],
      plugins: [{
        name: "isolated-profile-db",
        setup(builder) {
          builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "profile-test" }));
          builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "profile-test" }));
          builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
            path: join(testDir, "../../../lib/api-zod/src/index.ts"),
          }));
          builder.onLoad({ filter: /.*/, namespace: "profile-test" }, (args) => ({
            contents: args.path === "auth"
              ? `export const getAuth = (req) => ({ userId: req.get("x-test-user-id") });`
               : `export { profilesTable, casesTable, evidenceTable, transitionVerificationsTable } from ${
                JSON.stringify(join(testDir, "../../../lib/db/src/schema/sbu.ts"))
              }; export const db = globalThis.__profileTestDb;`,
            loader: "js",
            resolveDir: testDir,
          }));
        },
      }],
    });

    const { default: router } = await import(join(temporaryDir, "route.mjs"));
    const app = express();
    app.use("/api", router);
    server = app.listen(0);

    await t.test("tanpa identitas, middleware mengembalikan 401 dan tidak membuat profil", async () => {
      assert.deepEqual(await readProfiles(), [], "Tabel profil salinan harus mulai kosong");
      const response = await request(server);
      assert.equal(response.status, 401, response.raw);
      assert.deepEqual(await readProfiles(), [], "Permintaan tanpa sesi tidak boleh menyisipkan profil");
    });

    const profiles = [
      { userId: `test-a-${randomUUID()}`, role: "kontraktor",
        displayName: "Nama Pertama Privat", organizationName: "Organisasi Pertama Privat" },
      { userId: `test-b-${randomUUID()}`, role: "konsultan",
        displayName: "Nama Kedua Rahasia", organizationName: "Organisasi Kedua Rahasia" },
    ];
    for (const profile of profiles) {
      await isolated.query(
        "INSERT INTO sbu_profiles (user_id, role, display_name, organization_name) VALUES ($1, $2, $3, $4)",
        [profile.userId, profile.role, profile.displayName, profile.organizationName],
      );
    }
    const before = await readProfiles();

    for (const current of [profiles[0], profiles[1], profiles[0]]) {
      const other = profiles.find((profile) => profile !== current);
      const response = await request(server, current.userId);
      assert.equal(response.status, 200, response.raw);
      assert.deepEqual(response.body, {
        role: current.role,
        displayName: current.displayName,
        organizationName: current.organizationName,
      });
      for (const value of [other.userId, other.displayName, other.organizationName]) {
        assert.ok(!response.raw.includes(value), `Respons ${current.userId} membocorkan ${value}`);
      }
      assert.deepEqual(await readProfiles(), before, "GET tidak boleh mengubah profil pengguna lain");
    }
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__profileTestDb;
    try {
      try {
        await isolated.end();
      } finally {
        if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await admin.end();
      await rm(temporaryDir, { recursive: true, force: true });
    }
  }
});