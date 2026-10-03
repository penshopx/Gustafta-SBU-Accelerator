import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
const quote = (name) => `"${name.replaceAll('"', '""')}"`;

// Authenticate as a separate login. SET ROLE on an administrator connection
// would allow RESET ROLE to restore application-table write permissions.
export async function createRestrictedRoutePool(admin, schema) {
  const role = `sbu_route_test_${randomUUID().replaceAll("-", "")}`;
  const password = randomUUID();
  let created = false;
  let pool;
  const close = async () => {
    try {
      if (pool) await pool.end();
    } finally {
      if (created) {
        // Only revoke grants on our disposable schema; never change public ACLs.
        await admin.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${quote(schema)} FROM ${quote(role)}`);
        await admin.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${quote(schema)} FROM ${quote(role)}`);
        await admin.query(`REVOKE ALL ON SCHEMA ${quote(schema)} FROM ${quote(role)}`);
        await admin.query(`DROP ROLE ${quote(role)}`);
      }
    }
  };

  try {
    await admin.query(`CREATE ROLE ${quote(role)}
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD '${password}'`);
    created = true;
    await admin.query(`GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(role)}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(role)}`);
    await admin.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(role)}`);

    const url = new URL(process.env.DATABASE_URL);
    url.username = role;
    url.password = password;
    // Query parameters must not override the restricted login or search_path.
    for (const key of ["user", "password", "options"]) url.searchParams.delete(key);
    pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema}`, max: 2 });
    // Open both physical connections, including the one used in concurrent tests.
    const clients = [];
    try {
      clients.push(await pool.connect());
      clients.push(await pool.connect());
      for (const client of clients) {
        const { rows: [identity] } = await client.query(`
          SELECT current_user, session_user, current_schema(),
                 rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
          FROM pg_roles WHERE rolname = current_user
        `);
        assert.deepEqual(identity, {
          current_user: role, session_user: role, current_schema: schema,
          rolsuper: false, rolcreaterole: false, rolcreatedb: false,
          rolreplication: false, rolbypassrls: false,
        }, "Koneksi rute harus benar-benar masuk sebagai akun terbatas, bukan administrator");
        const { rows: [authority] } = await client.query(`
          SELECT has_database_privilege(current_database(), 'CREATE') AS can_create_schema,
                 EXISTS (
                   SELECT 1 FROM pg_auth_members
                   WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                 ) AS has_membership
        `);
        assert.deepEqual(authority, { can_create_schema: false, has_membership: false },
          "Akun rute tidak boleh membuat skema lain atau mengambil izin akun lain");

        const { rows: unsafe } = await client.query(`
          SELECT n.nspname AS schema, c.relname AS object
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname <> $1 AND n.nspname NOT LIKE 'pg_%'
            AND n.nspname <> 'information_schema'
            AND (
              (c.relkind IN ('r', 'p', 'v', 'm', 'f') AND (
                has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
                OR has_any_column_privilege(c.oid, 'INSERT,UPDATE')))
              OR (c.relkind = 'S' AND has_sequence_privilege(c.oid, 'USAGE,UPDATE'))
            )
        `, [schema]);
        assert.deepEqual(unsafe, [],
          "Izin bawaan/PUBLIC memberi akun uji akses tulis di luar skema salinan; perbaiki izin sebelum menjalankan rute");
        const { rows: writableSchemas } = await client.query(`
          SELECT nspname FROM pg_namespace
          WHERE nspname <> $1 AND nspname NOT LIKE 'pg_%'
            AND has_schema_privilege(oid, 'CREATE')
        `, [schema]);
        assert.deepEqual(writableSchemas, [], "Akun rute tidak boleh membuat objek di skema aplikasi");

        // EXPLAIN without ANALYZE checks permissions without executing writes
        // or statement-level triggers, even if privileges accidentally regress.
        for (const sql of [
          "EXPLAIN INSERT INTO public.sbu_profiles (user_id) SELECT 'permission-probe' WHERE false",
          "EXPLAIN UPDATE public.sbu_profiles SET display_name = display_name WHERE false",
          "EXPLAIN DELETE FROM public.sbu_profiles WHERE false",
        ]) {
          await assert.rejects(client.query(sql), { code: "42501" },
            "PostgreSQL harus menolak penulisan eksplisit ke public sebelum rute dijalankan");
        }
      }
    } finally {
      for (const client of clients) client.release();
    }
    return { pool, close };
  } catch (error) {
    await close();
    throw new Error(
      "Konfigurasi isolasi PostgreSQL gagal: diperlukan CREATE ROLE, izin GRANT pada skema salinan, dan login akun uji tanpa akses tulis aplikasi. Uji dihentikan tanpa menjalankan rute.",
      { cause: error },
    );
  }
}