import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createRestrictedRoutePool } from "./helpers/restricted-postgres.mjs";

const { Pool } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");

test("kegagalan CREATE ROLE atau GRANT menghentikan konfigurasi tanpa fallback administrator", async () => {
  for (const failAt of [1, 2]) {
    const statements = [];
    const denied = Object.assign(new Error("permission denied"), { code: "42501" });
    const admin = {
      async query(sql) {
        statements.push(sql);
        if (statements.length === failAt) throw denied;
        return { rows: [] };
      },
    };
    await assert.rejects(createRestrictedRoutePool(admin, "sbu_permission_setup_test"), (error) => {
      assert.match(error.message, /Konfigurasi isolasi PostgreSQL gagal/);
      assert.match(error.message, /Uji dihentikan tanpa menjalankan rute/);
      assert.equal(error.cause, denied);
      return true;
    });
    assert.equal(statements.some((sql) => sql.includes("DROP ROLE")), failAt === 2,
      "Akun yang sudah dibuat harus dibersihkan walaupun GRANT gagal");
  }
});

test("akun rute PostgreSQL menulis klon tetapi tidak dapat memulihkan izin administrator", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL diperlukan untuk pengujian integrasi PostgreSQL");
  assert.notEqual(process.env.NODE_ENV, "production", "Pengujian tidak boleh dijalankan dalam mode produksi");
  const schema = `sbu_permission_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let created = false;
  let restricted;
  let role;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await admin.query(`CREATE TABLE "${schema}".sbu_profiles (LIKE public.sbu_profiles INCLUDING ALL)`);
    restricted = await createRestrictedRoutePool(admin, schema);
    const { rows: [identity] } = await restricted.pool.query("SELECT current_user, session_user");
    role = identity.current_user;
    await restricted.pool.query("RESET ROLE");
    await restricted.pool.query("RESET SESSION AUTHORIZATION");
    assert.deepEqual((await restricted.pool.query("SELECT current_user, session_user")).rows, [identity],
      "RESET tidak boleh mengembalikan sesi administrator");
    const { rows: [administrator] } = await admin.query("SELECT current_user");
    const quotedAdmin = `"${administrator.current_user.replaceAll('"', '""')}"`;
    await assert.rejects(restricted.pool.query(`SET ROLE ${quotedAdmin}`), { code: "42501" });
    await assert.rejects(restricted.pool.query(`SET SESSION AUTHORIZATION ${quotedAdmin}`), { code: "42501" });
    await assert.rejects(createRestrictedRoutePool(restricted.pool, schema), (error) => {
      assert.match(error.message, /Konfigurasi isolasi PostgreSQL gagal/);
      assert.equal(error.cause.code, "42501");
      return true;
    });
    await restricted.pool.query("INSERT INTO sbu_profiles (user_id) VALUES ('clone-only')");
    await restricted.pool.query("UPDATE sbu_profiles SET display_name = 'Updated' WHERE user_id = 'clone-only'");
    assert.deepEqual((await restricted.pool.query("SELECT display_name FROM sbu_profiles")).rows,
      [{ display_name: "Updated" }]);
    await restricted.pool.query("DELETE FROM sbu_profiles WHERE user_id = 'clone-only'");
    assert.deepEqual((await restricted.pool.query("SELECT * FROM sbu_profiles")).rows, []);
    await restricted.close();
    restricted = undefined;
    assert.deepEqual((await admin.query("SELECT rolname FROM pg_roles WHERE rolname = $1", [role])).rows, [],
      "Akun sementara harus terhapus setelah koneksi ditutup");
  } finally {
    try {
      if (restricted) await restricted.close();
    } finally {
      try {
        if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    }
  }
});