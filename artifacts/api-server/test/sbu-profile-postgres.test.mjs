import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
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

function checkpoint() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function withinDeadline(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Batas waktu urutan query: ${label}`)), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
  const contentType = response.headers.get("content-type") ?? "";
  // Express rejects unreadable JSON before the router and returns HTML.
  const body = contentType.includes("application/json") ? JSON.parse(raw) : undefined;
  return { status: response.status, body, raw, contentType };
}

test("GET dan PATCH /api/me menolak pengunjung tanpa sesi dan mengisolasi profil di PostgreSQL", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL diperlukan untuk pengujian integrasi PostgreSQL");
  assert.notEqual(process.env.NODE_ENV, "production", "Pengujian tidak boleh dijalankan dalam mode produksi");

  const schema = `sbu_profile_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let isolated;
  let restricted;
  let temporaryDir;
  let created = false;
  let server;
  let primaryError;

  try {
    temporaryDir = await mkdtemp(join(testDir, ".sbu-profile-pg-"));
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
    const routeRequest = new AsyncLocalStorage();
    let controlQuery;
    // Scheduling only: every statement and result still goes through the real
    // restricted PostgreSQL pool. Never substitute query results or Drizzle SQL.
    globalThis.__profileTestDb = drizzle({
      query(...args) {
        const execute = () => isolated.query(...args);
        return controlQuery ? controlQuery(args, execute, routeRequest.getStore()) : execute();
      },
    }, {
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
              : `export * from ${
                JSON.stringify(join(testDir, "../../../lib/db/src/schema/index.ts"))
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
    app.use((req, _res, next) => routeRequest.run({
      method: req.method,
      userId: req.get("x-test-user-id"),
      displayName: req.body?.displayName,
    }, next));
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

    for (const failedMethod of ["GET", "PATCH"]) {
      for (const retryMethod of ["GET", "PATCH"]) {
        await t.test(`${failedMethod} pertama gagal di PostgreSQL tanpa profil parsial; percobaan ulang ${retryMethod} berhasil`, async () => {
          const userId = `test-first-write-failure-${randomUUID()}`;
          const changes = {
            role: "konsultan",
            displayName: "Nama Setelah Percobaan Ulang",
            organizationName: "Organisasi Setelah Percobaan Ulang",
          };
          const options = (method) => method === "PATCH" ? {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(changes),
          } : { method };
          const ownProfiles = async () => (await isolated.query(
            "SELECT * FROM sbu_profiles WHERE user_id = $1", [userId],
          )).rows;
          const applicationProfiles = async () => (await admin.query(
            "SELECT * FROM public.sbu_profiles WHERE user_id = $1", [userId],
          )).rows;
          const before = await readProfiles();
          assert.deepEqual(await ownProfiles(), [], "Profil pertama belum dibuat");
          assert.deepEqual(await applicationProfiles(), [], "ID uji tidak boleh ada di public");

          // The identifier contains only our generated UUID, never request input.
          // A real CHECK violation is confined to this disposable table.
          const constraint = "reject_first_profile_write";
          let constraintCreated = false;
          const failures = [];
          try {
            await admin.query(`ALTER TABLE "${schema}".sbu_profiles
              ADD CONSTRAINT "${constraint}" CHECK (user_id <> '${userId}')`);
            constraintCreated = true;
            controlQuery = async (args, execute, context) => {
              if (context?.userId !== userId) return execute();
              const sql = typeof args[0] === "string" ? args[0] : args[0].text;
              assert.match(sql, /^insert into "sbu_profiles"/i,
                "Kegagalan harus berasal dari INSERT profil pertama yang sebenarnya");
              try {
                return await execute();
              } catch (error) {
                failures.push(error);
                throw error;
              }
            };

            const failed = await request(server, userId, options(failedMethod));
            assert.equal(failed.status, 500, failed.raw);
            assert.equal(failures.length, 1, "PostgreSQL harus menolak satu penulisan nyata");
            assert.equal(failures[0].code, "23514", "Harus berupa pelanggaran CHECK PostgreSQL");
            assert.equal(failures[0].schema, schema, "SQL gagal hanya pada skema salinan");
            assert.equal(failures[0].table, "sbu_profiles");
            assert.equal(failures[0].constraint, constraint);
            assert.deepEqual(await ownProfiles(), [], "Penulisan gagal tidak boleh meninggalkan profil parsial");
            assert.deepEqual(await readProfiles(), before, "Profil lain tidak boleh berubah saat penulisan gagal");
            assert.deepEqual(await applicationProfiles(), [], "Kegagalan tidak boleh menulis ke public");

            controlQuery = undefined;
            await admin.query(`ALTER TABLE "${schema}".sbu_profiles DROP CONSTRAINT "${constraint}"`);
            constraintCreated = false;

            const retry = await request(server, userId, options(retryMethod));
            const expected = {
              userId,
              ...(retryMethod === "PATCH" ? changes : {
                role: "belum_dipilih", displayName: "", organizationName: "",
              }),
            };
            assert.equal(retry.status, 200, retry.raw);
            assert.deepEqual(retry.body, expected);
            assert.deepEqual(await ownProfiles(), [{
              user_id: userId,
              role: expected.role,
              display_name: expected.displayName,
              organization_name: expected.organizationName,
            }], "Percobaan ulang harus menyimpan tepat satu profil dengan semua nilai yang benar");

            const persisted = await request(server, userId);
            assert.equal(persisted.status, 200, persisted.raw);
            assert.deepEqual(persisted.body, expected, "GET berikutnya harus membaca profil tersimpan");
            assert.equal((await ownProfiles()).length, 1, "GET berikutnya tidak boleh menggandakan profil");
            assert.deepEqual((await readProfiles()).filter((row) => row.user_id !== userId), before,
              "Percobaan ulang tidak boleh mengubah profil lain");
            assert.deepEqual(await applicationProfiles(), [], "ID uji harus tetap tidak ada di public.sbu_profiles");
          } finally {
            controlQuery = undefined;
            if (constraintCreated) {
              await admin.query(`ALTER TABLE "${schema}".sbu_profiles DROP CONSTRAINT "${constraint}"`);
            }
          }
        });
      }
    }

    for (const first of ["GET", "PATCH"]) {
      await t.test(`GET dan PATCH pertama bersamaan: penulisan ${first} lebih dahulu tidak kehilangan perubahan`, async () => {
        const userId = `test-concurrent-owner-${randomUUID()}`;
        const changes = {
          role: "konsultan",
          displayName: "Nama Tersimpan Bersamaan",
          organizationName: "Organisasi Tersimpan Bersamaan",
        };
        const expected = { userId, ...changes };
        const ownProfiles = async () => (await isolated.query(
          "SELECT user_id, role, display_name, organization_name FROM sbu_profiles WHERE user_id = $1",
          [userId],
        )).rows;
        const applicationProfiles = async () => (await admin.query(
          "SELECT * FROM public.sbu_profiles WHERE user_id = $1", [userId],
        )).rows;
        const before = await readProfiles();
        assert.deepEqual(await ownProfiles(), [], "Pemilik sesi belum memiliki profil");
        assert.deepEqual(await applicationProfiles(), [], "ID uji tidak boleh ada di public");

        const gates = Object.fromEntries(["GET", "PATCH"].map((method) => [method, {
          arrived: checkpoint(), release: checkpoint(), completed: checkpoint(),
        }]));
        const readRelease = checkpoint();
        const order = [];
        const queries = { GET: 0, PATCH: 0 };
        controlQuery = async (args, execute, context) => {
          if (context?.userId !== userId) return execute();
          const method = context.method;
          const gate = gates[method];
          const index = queries[method]++;
          if (index === 0) {
            const sql = typeof args[0] === "string" ? args[0] : args[0].text;
            assert.match(sql, /^insert into "sbu_profiles"/i,
              "Query pertama kedua rute harus benar-benar menyisipkan profil");
            gate.arrived.resolve();
            await gate.release.promise;
            try {
              const result = await execute();
              order.push(method);
              return result;
            } finally {
              gate.completed.resolve();
            }
          }
          // Keep the GET response in flight until PATCH has committed, even
          // when GET inserted the default first.
          if (method === "GET") await readRelease.promise;
          return execute();
        };

        const pending = [
          request(server, userId),
          request(server, userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(changes),
          }),
        ];
        try {
          await withinDeadline(Promise.all(Object.values(gates).map((gate) => gate.arrived.promise)),
            "kedua permintaan mencapai INSERT");
          assert.deepEqual(await ownProfiles(), [],
            "Kedua permintaan harus dimulai sebelum profil pertama dibuat");
          const second = first === "GET" ? "PATCH" : "GET";
          gates[first].release.resolve();
          await withinDeadline(gates[first].completed.promise, `INSERT ${first}`);
          assert.deepEqual(order, [first], "Penulisan kedua harus masih tertahan");
          assert.deepEqual(await ownProfiles(), [{
            user_id: userId,
            role: first === "GET" ? "belum_dipilih" : changes.role,
            display_name: first === "GET" ? "" : changes.displayName,
            organization_name: first === "GET" ? "" : changes.organizationName,
          }], "Penulisan pertama harus sudah tersimpan sebelum konflik kedua");
          gates[second].release.resolve();
          await withinDeadline(gates[second].completed.promise, `INSERT ${second}`);
          assert.deepEqual(order, [first, second], "Kedua urutan konflik diuji tanpa perlombaan waktu");
          readRelease.resolve();

          const responses = await withinDeadline(Promise.all(pending), "respons GET dan PATCH");
          for (const response of responses) {
            assert.equal(response.status, 200, response.raw);
            assert.deepEqual(response.body, expected,
              "GET setelah PATCH tersimpan dan respons PATCH harus memuat nilai baru");
          }
          assert.deepEqual(await ownProfiles(), [{
            user_id: userId,
            role: changes.role,
            display_name: changes.displayName,
            organization_name: changes.organizationName,
          }], "Tepat satu baris pemilik sesi tersimpan tanpa ditimpa profil default");
          const persisted = await request(server, userId);
          assert.equal(persisted.status, 200, persisted.raw);
          assert.deepEqual(persisted.body, expected, "GET berikutnya tetap membaca hasil PATCH");
          assert.deepEqual((await readProfiles()).filter((row) => row.user_id !== userId), before,
            "Profil lain di tabel salinan tidak boleh berubah");
          assert.deepEqual(await applicationProfiles(), [], "Tidak ada data uji di public.sbu_profiles");
        } finally {
          controlQuery = undefined;
          for (const gate of Object.values(gates)) gate.release.resolve();
          readRelease.resolve();
          await withinDeadline(Promise.allSettled(pending), "pembersihan permintaan bersamaan");
        }
      });
    }

    for (const ownExists of [false, true]) {
      for (const first of ["A", "B"]) {
        await t.test(`dua PATCH bersamaan pada profil ${ownExists ? "lama" : "baru"} menyimpan nilai utuh saat ${first} lebih dahulu`, async () => {
          const userId = `test-two-patches-${randomUUID()}`;
          const changes = {
            A: { role: "kontraktor", displayName: "Nama PATCH A", organizationName: "Organisasi PATCH A" },
            B: { role: "konsultan", displayName: "Nama PATCH B", organizationName: "Organisasi PATCH B" },
          };
          const second = first === "A" ? "B" : "A";
          const ownProfiles = async () => (await isolated.query(
            "SELECT * FROM sbu_profiles WHERE user_id = $1", [userId],
          )).rows;
          const applicationProfiles = async () => (await admin.query(
            "SELECT * FROM public.sbu_profiles WHERE user_id = $1", [userId],
          )).rows;
          const expectedRow = (label) => ({
            user_id: userId,
            role: changes[label].role,
            display_name: changes[label].displayName,
            organization_name: changes[label].organizationName,
          });
          assert.deepEqual(await applicationProfiles(), [], "ID uji tidak boleh ada di public");
          if (ownExists) {
            await isolated.query(
              "INSERT INTO sbu_profiles (user_id, role, display_name, organization_name) VALUES ($1, $2, $3, $4)",
              [userId, "profesional", "Nama Sebelum PATCH", "Organisasi Sebelum PATCH"],
            );
          }
          const before = await readProfiles();
          const initialOwnProfiles = await ownProfiles();
          assert.equal(initialOwnProfiles.length, ownExists ? 1 : 0);
          const gates = Object.fromEntries(["A", "B"].map((label) => [label, {
            arrived: checkpoint(), release: checkpoint(), completed: checkpoint(),
          }]));
          const order = [];
          const queries = { A: 0, B: 0 };
          controlQuery = async (args, execute, context) => {
            if (context?.userId !== userId) return execute();
            assert.equal(context.method, "PATCH");
            const label = Object.keys(changes).find((key) => changes[key].displayName === context.displayName);
            assert.ok(label, "Urutan query harus terikat pada body PATCH, bukan urutan kedatangan HTTP");
            queries[label] += 1;
            assert.equal(queries[label], 1, "Setiap PATCH harus menyimpan semua kolom dalam satu upsert atomik");
            const sql = typeof args[0] === "string" ? args[0] : args[0].text;
            assert.match(sql, /^insert into "sbu_profiles"/i);
            assert.match(sql, /on conflict .* do update set /i);
            const gate = gates[label];
            gate.arrived.resolve();
            await gate.release.promise;
            try {
              const result = await execute();
              order.push(label);
              return result;
            } finally {
              gate.completed.resolve();
            }
          };

          const pending = ["A", "B"].map((label) => request(server, userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(changes[label]),
          }));
          try {
            await withinDeadline(Promise.all(Object.values(gates).map((gate) => gate.arrived.promise)),
              "kedua PATCH mencapai upsert sebelum penulisan pertama");
            assert.deepEqual(await ownProfiles(), initialOwnProfiles,
              "Kedua PATCH harus masih berlangsung tanpa mengubah profil");
            gates[first].release.resolve();
            await withinDeadline(gates[first].completed.promise, `upsert PATCH ${first}`);
            assert.deepEqual(order, [first], "PATCH kedua harus masih tertahan");
            assert.deepEqual(await ownProfiles(), [expectedRow(first)],
              "Semua kolom hasil penulisan pertama harus berasal dari PATCH pertama");
            assert.deepEqual(await applicationProfiles(), [], "PATCH pertama tidak boleh menulis ke public");

            gates[second].release.resolve();
            await withinDeadline(gates[second].completed.promise, `upsert PATCH ${second}`);
            const responses = await withinDeadline(Promise.all(pending), "respons kedua PATCH");
            for (const [index, label] of ["A", "B"].entries()) {
              assert.equal(responses[index].status, 200, responses[index].raw);
              assert.deepEqual(responses[index].body, { userId, ...changes[label] },
                "Setiap respons PATCH harus mengembalikan nilai lengkap permintaannya sendiri");
            }
            assert.deepEqual(order, [first, second], "Urutan penyimpanan harus sesuai pengendalian query");
            assert.deepEqual(queries, { A: 1, B: 1 }, "Kedua PATCH harus menjalankan Drizzle nyata");
            assert.deepEqual(await ownProfiles(), [expectedRow(second)],
              "Hanya satu baris tersimpan dan seluruh kolom berasal dari PATCH terakhir, bukan campuran");
            const after = await readProfiles();
            assert.equal(after.length, before.length + (ownExists ? 0 : 1));
            assert.deepEqual(after.filter((row) => row.user_id !== userId),
              before.filter((row) => row.user_id !== userId), "Profil pengguna lain tidak boleh berubah");
            controlQuery = undefined;
            const persisted = await request(server, userId);
            assert.equal(persisted.status, 200, persisted.raw);
            assert.deepEqual(persisted.body, { userId, ...changes[second] },
              "GET berikutnya harus membaca profil utuh yang terakhir tersimpan");
            assert.deepEqual(await applicationProfiles(), [], "public.sbu_profiles tidak boleh menerima ID uji");
          } finally {
            controlQuery = undefined;
            for (const gate of Object.values(gates)) gate.release.resolve();
            await withinDeadline(Promise.allSettled(pending), "pembersihan dua PATCH bersamaan");
          }
        });
      }
    }

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

    for (const ownExists of [true, false]) {
      await t.test(`PATCH dengan isian tidak valid ${ownExists ? "menjaga seluruh kolom profil lama" : "tidak membuat profil baru"}`, async (t) => {
        const ownId = `test-invalid-owner-${randomUUID()}`;
        const otherId = `test-invalid-other-${randomUUID()}`;
        const validBody = {
          role: "konsultan",
          displayName: "Nama Pengganti",
          organizationName: "Organisasi Pengganti",
        };
        await isolated.query(
          "INSERT INTO sbu_profiles (user_id, role, display_name, organization_name) VALUES ($1, $2, $3, $4)",
          [otherId, "profesional", "Nama Pengguna Lain Privat", "Organisasi Pengguna Lain Privat"],
        );
        if (ownExists) {
          await isolated.query(
            "INSERT INTO sbu_profiles (user_id, role, display_name, organization_name) VALUES ($1, $2, $3, $4)",
            [ownId, "kontraktor", "Nama Pemilik Lama", "Organisasi Pemilik Lama"],
          );
        }
        const allIsolatedProfiles = async () => (await isolated.query(
          "SELECT * FROM sbu_profiles ORDER BY user_id",
        )).rows;
        const applicationProfiles = async () => (await admin.query(
          "SELECT * FROM public.sbu_profiles WHERE user_id = ANY($1::text[]) ORDER BY user_id",
          [[ownId, otherId]],
        )).rows;
        const before = await allIsolatedProfiles();
        assert.equal(before.filter((row) => row.user_id === ownId).length, ownExists ? 1 : 0);
        assert.deepEqual(await applicationProfiles(), [], "ID uji tidak boleh ada di tabel aplikasi");

        const invalidInputs = [
          { label: "role di luar pilihan", body: { ...validBody, role: "peran-tidak-dikenal" } },
        ];
        for (const field of ["role", "displayName", "organizationName"]) {
          const withoutField = { ...validBody };
          delete withoutField[field];
          invalidInputs.push(
            { label: `${field} wajib hilang`, body: withoutField },
            { label: `${field} bertipe angka`, body: { ...validBody, [field]: 123 } },
          );
        }
        const invalidRequests = [
          ...invalidInputs.map(({ label, body }) => ({ label, body: JSON.stringify(body) })),
          { label: "JSON terpotong", body: JSON.stringify(validBody).slice(0, -1), parserError: true },
          { label: "JSON dengan koma berlebih", body: '{"role":"konsultan",}', parserError: true },
          { label: "body tidak dikirim", body: undefined },
          { label: "body kosong", body: "" },
          { label: "body hanya spasi", body: " \t\r\n ", parserError: true },
          { label: "array kosong", body: "[]" },
          { label: "array berisi profil valid", body: JSON.stringify([validBody]) },
          { label: "nilai null", body: "null", parserError: true },
          { label: "nilai string", body: JSON.stringify("profil"), parserError: true },
          { label: "nilai angka", body: "123", parserError: true },
          { label: "nilai boolean", body: "true", parserError: true },
        ];
        for (const { label, body, parserError = false } of invalidRequests) {
          await t.test(label, async () => {
            const beforeQueryCount = routeQueryCount;
            const response = await request(server, ownId, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body,
            });
            assert.equal(response.status, 400, response.raw);
            if (parserError) {
              assert.match(response.contentType, /^text\/html\b/,
                "JSON rusak atau primitif harus ditolak parser Express sebelum mencapai rute");
              assert.equal(response.body, undefined);
              assert.match(response.raw, /Bad Request|SyntaxError/,
                "Respons parser harus menunjukkan permintaan tidak valid tanpa bergantung pada stack trace");
            } else {
              assert.match(response.contentType, /^application\/json\b/);
              assert.equal(response.body.error, "Profil tidak valid.");
            }
            assert.equal(routeQueryCount, beforeQueryCount,
              "Validasi harus menolak sebelum SQL apa pun, termasuk INSERT atau UPDATE profil");
            const after = await allIsolatedProfiles();
            assert.deepEqual(after, before,
              "Semua kolom dan jumlah baris harus tetap utuh, termasuk profil pengguna lain");
            assert.equal(
              after.filter((row) => row.user_id === ownId).length,
              ownExists ? 1 : 0,
              "Permintaan tidak valid tidak boleh menghapus profil lama atau membuat profil baru",
            );
            assert.deepEqual(await applicationProfiles(), [],
              "Permintaan tidak valid tidak boleh menulis profil uji ke tabel aplikasi");
          });
        }
      });
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
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    const cleanup = async (action) => {
      try { await action(); } catch (error) { cleanupErrors.push(error); }
    };
    if (server) await cleanup(() => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())));
    delete globalThis.__profileTestDb;
    if (restricted) await cleanup(() => restricted.close());
    if (created) await cleanup(() => admin.query(`DROP SCHEMA "${schema}" CASCADE`));
    await cleanup(() => admin.end());
    if (temporaryDir) await cleanup(() => rm(temporaryDir, { recursive: true, force: true }));
    if (cleanupErrors.length) {
      throw new AggregateError(
        [...(primaryError ? [primaryError] : []), ...cleanupErrors],
        "Pembersihan pengujian profil gagal; kesalahan pengujian asli tetap disertakan",
      );
    }
  }
});