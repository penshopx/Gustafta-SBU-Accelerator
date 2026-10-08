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
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");

async function request(server, userId, options = {}) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/me`, {
    ...options,
    headers: {
      ...options.headers,
      ...(userId === undefined ? {} : { "x-test-user-id": userId, "X-SBU-Form-Owner": userId }),
    },
  });
  const raw = await response.text();
  return { status: response.status, body: JSON.parse(raw), raw };
}

test("GET dan PATCH /api/me menolak pengunjung tanpa sesi dan mengisolasi profil di PostgreSQL", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL diperlukan untuk pengujian integrasi PostgreSQL");
  assert.notEqual(process.env.NODE_ENV, "production", "Pengujian tidak boleh dijalankan dalam mode produksi");

  const schema = `sbu_profile_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let isolated;
  let restricted;
  const temporaryDir = await mkdtemp(join(testDir, ".sbu-profile-pg-"));
  let created = false;
  let server;

  try {
    // Clone only the profile table; route writes use a separate restricted login.
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await admin.query(`CREATE TABLE "${schema}".sbu_profiles (LIKE public.sbu_profiles INCLUDING ALL)`);
    restricted = await createRestrictedRoutePool(admin, schema);
    isolated = restricted.pool;

    const { rows: [target] } = await isolated.query(`
      SELECT current_schema() AS current_schema,
             (SELECT n.nspname FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.oid = to_regclass('sbu_profiles')) AS table_schema
    `);
    assert.deepEqual(target, { current_schema: schema, table_schema: schema },
      "Koneksi route harus memilih tabel sementara, bukan tabel aplikasi");

    const { rows: [keys] } = await admin.query(`
      SELECT
        EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = 'public.sbu_profiles'::regclass
                  AND contype = 'p' AND conkey = ARRAY[
                    (SELECT attnum FROM pg_attribute
                     WHERE attrelid = 'public.sbu_profiles'::regclass AND attname = 'user_id')
                  ]::smallint[]) AS application_key,
        EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = '"${schema}".sbu_profiles'::regclass
                  AND contype = 'p' AND conkey = ARRAY[
                    (SELECT attnum FROM pg_attribute
                     WHERE attrelid = '"${schema}".sbu_profiles'::regclass AND attname = 'user_id')
                  ]::smallint[]) AS cloned_key
    `);
    assert.deepEqual(keys, { application_key: true, cloned_key: true },
      "ON CONFLICT harus diuji dengan kunci utama user_id pada kedua tabel");

    const readProfiles = async () => (await isolated.query(
      "SELECT user_id, role, display_name, organization_name FROM sbu_profiles ORDER BY user_id",
    )).rows;

    // Only auth is replaced. The route uses the actual Drizzle query builder,
    // PostgreSQL pool and application's real profile table definition.
    let routeQueryCount = 0;
    globalThis.__profileTestDb = drizzle(isolated, {
      logger: { logQuery() { routeQueryCount += 1; } },
    });
    await build({
      entryPoints: [join(testDir, "../src/routes/sbu.ts")],
      outfile: join(temporaryDir, "route.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      external: ["express", "@google-cloud/*"],
      plugins: [{
        name: "isolated-profile-db",
        setup(builder) {
          builder.onResolve({ filter: /\/workspace-context$/ }, () => ({
            path: join(testDir, "helpers/workspace-context-fixture.mjs"),
          }));
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
    app.use(express.json());
    app.use("/api", router);
    server = app.listen(0);

    await t.test("tanpa identitas, middleware mengembalikan 401 dan tidak membuat profil", async () => {
      assert.deepEqual(await readProfiles(), [], "Tabel profil salinan harus mulai kosong");
      const response = await request(server);
      assert.equal(response.status, 401, response.raw);
      assert.deepEqual(await readProfiles(), [], "Permintaan tanpa sesi tidak boleh menyisipkan profil");
    });

    await t.test("PATCH tanpa identitas mengembalikan 401 sebelum menjalankan SQL dan tabel salinan tetap kosong", async () => {
      assert.deepEqual(await readProfiles(), [], "Tabel profil salinan harus mulai kosong");
      const beforeQueryCount = routeQueryCount;
      const response = await request(server, undefined, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "konsultan",
          displayName: "Profil Tanpa Sesi",
          organizationName: "Organisasi Tanpa Sesi",
        }),
      });
      assert.equal(response.status, 401, response.raw);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
      assert.equal(routeQueryCount, beforeQueryCount,
        "PATCH tanpa sesi tidak boleh menjalankan SQL, termasuk upsert ke tabel salinan atau aplikasi");
      assert.deepEqual(await readProfiles(), [],
        "PATCH tanpa sesi tidak boleh membuat profil di tabel salinan");
    });

    await t.test("dua permintaan pertama bersamaan membuat tepat satu profil awal di tabel salinan", async () => {
      const userId = `test-new-${randomUUID()}`;
      const applicationCount = async () => (await admin.query(
        "SELECT count(*)::int AS count FROM public.sbu_profiles WHERE user_id = $1", [userId],
      )).rows[0].count;
      assert.equal(await applicationCount(), 0, "Pengguna uji tidak boleh ada di tabel aplikasi");
      assert.deepEqual(await readProfiles(), [], "Pengguna baru belum memiliki profil di tabel salinan");

      const responses = await Promise.all([request(server, userId), request(server, userId)]);
      for (const response of responses) {
        assert.equal(response.status, 200, response.raw);
        assert.deepEqual(response.body, {
          userId,
          role: "belum_dipilih",
          displayName: "",
          organizationName: "",
        });
      }
      assert.deepEqual(await readProfiles(), [{
        user_id: userId,
        role: "belum_dipilih",
        display_name: "",
        organization_name: "",
      }], "Dua GET paralel harus menghasilkan satu baris profil saja");
      assert.equal(await applicationCount(), 0, "Tabel aplikasi tidak boleh menerima profil pengguna uji");
    });

    for (const ownExists of [false, true]) {
      for (const otherExists of [false, true]) {
        await t.test(`PATCH dengan sesi sah ${ownExists ? "memperbarui" : "membuat"} profil sendiri saat userId body ${otherExists ? "sudah ada" : "belum ada"}`, async () => {
          const ownId = `test-patch-owner-${randomUUID()}`;
          const otherId = `test-patch-other-${randomUUID()}`;
          const changes = {
            role: "konsultan",
            displayName: "Nama Pemilik Sesi Baru",
            organizationName: "Organisasi Pemilik Sesi Baru",
          };
          const applicationProfiles = async () => (await admin.query(
            "SELECT * FROM public.sbu_profiles WHERE user_id = ANY($1::text[]) ORDER BY user_id",
            [[ownId, otherId]],
          )).rows;
          const allIsolatedProfiles = async () => (await isolated.query(
            "SELECT * FROM sbu_profiles ORDER BY user_id",
          )).rows;
          assert.deepEqual(await applicationProfiles(), [],
            "Kedua ID uji harus belum ada di tabel aplikasi");

          if (ownExists) {
            await isolated.query(
              "INSERT INTO sbu_profiles (user_id, role, display_name, organization_name) VALUES ($1, $2, $3, $4)",
              [ownId, "kontraktor", "Nama Pemilik Sesi Lama", "Organisasi Pemilik Sesi Lama"],
            );
          }
          if (otherExists) {
            await isolated.query(
              "INSERT INTO sbu_profiles (user_id, role, display_name, organization_name) VALUES ($1, $2, $3, $4)",
              [otherId, "profesional", "Nama Pengguna Lain Privat", "Organisasi Pengguna Lain Privat"],
            );
          }
          const before = await allIsolatedProfiles();
          const beforeQueryCount = routeQueryCount;
          const response = await request(server, ownId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: otherId, ...changes }),
          });
          assert.equal(response.status, 200, response.raw);
          assert.ok(routeQueryCount > beforeQueryCount,
            "PATCH harus menjalankan query builder Drizzle terhadap PostgreSQL nyata");

          const after = await allIsolatedProfiles();
          const ownRows = after.filter((row) => row.user_id === ownId);
          assert.equal(ownRows.length, 1, "Hanya satu profil pemilik sesi boleh tersimpan");
          assert.deepEqual({
            user_id: ownRows[0].user_id,
            role: ownRows[0].role,
            display_name: ownRows[0].display_name,
            organization_name: ownRows[0].organization_name,
          }, {
            user_id: ownId,
            role: changes.role,
            display_name: changes.displayName,
            organization_name: changes.organizationName,
          }, "Perubahan harus tersimpan pada ID sesi, bukan userId dalam body");
          assert.deepEqual(
            after.filter((row) => row.user_id !== ownId),
            before.filter((row) => row.user_id !== ownId),
            "Semua kolom profil pihak lain harus tetap utuh dan ID palsu tidak boleh dibuat",
          );
          assert.equal(after.filter((row) => row.user_id === otherId).length, otherExists ? 1 : 0,
            "Keberadaan profil pihak lain tidak boleh berubah");
          assert.equal(after.length, before.length + (ownExists ? 0 : 1),
            "PATCH hanya boleh menambah baris bila pemilik sesi belum memiliki profil");
          assert.deepEqual(await applicationProfiles(), [],
            "Pembuatan maupun pembaruan profil uji tidak boleh menulis ke tabel aplikasi");
        });
      }
    }

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
        userId: current.userId,
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
        if (restricted) await restricted.close();
      } finally {
        if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await admin.end();
      await rm(temporaryDir, { recursive: true, force: true });
    }
  }
});