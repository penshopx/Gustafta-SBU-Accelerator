import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

// Run against development PostgreSQL only. The isolated schema is discarded;
// no rows are inserted into the application's tables.
test("PostgreSQL enforces one evidence row per case and code, including concurrent inserts", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the PostgreSQL integration test");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const schema = `sbu_evidence_test_${randomUUID().replaceAll("-", "")}`;
  const table = `"${schema}".sbu_evidence`;
  let created = false;

  try {
    // A schema declaration alone does not prove that the index was pushed to
    // the running database. Inspect the real table before creating test data.
    const { rows: indexes } = await pool.query(`
      SELECT i.indisunique, i.indisvalid,
             i.indpred IS NULL AS unfiltered,
             i.indexprs IS NULL AS plain_columns,
             ARRAY(
               SELECT a.attname
               FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, position)
               JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = key.attnum
               WHERE key.position <= i.indnkeyatts
               ORDER BY key.position
             )::text[] AS columns
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      WHERE ns.nspname = 'public'
        AND tbl.relname = 'sbu_evidence'
        AND idx.relname = 'sbu_evidence_case_code_unique'
    `);
    assert.equal(indexes.length, 1, "Indeks unik bukti belum diterapkan di PostgreSQL");
    assert.deepEqual(indexes[0], {
      indisunique: true,
      indisvalid: true,
      unfiltered: true,
      plain_columns: true,
      columns: ["case_id", "code"],
    });

    // LIKE INCLUDING ALL copies the live table's columns and indexes, but not
    // its foreign keys. This keeps concurrent inserts independent of user data.
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await pool.query(`CREATE TABLE ${table} (LIKE public.sbu_evidence INCLUDING ALL)`);

    const insert = (id, caseId, title, note) => pool.query(
      `INSERT INTO ${table} (id, case_id, code, title, note)
       VALUES ($1, $2, 'legalitas', $3, $4)
       ON CONFLICT DO NOTHING RETURNING id, case_id, code, title, note, updated_at`,
      [id, caseId, title, note],
    );
    const first = await insert(1, 101, "Bukti pertama", "Isi asli");
    const otherCase = await insert(2, 102, "Bukti kedua", "Kasus lain");
    assert.equal(first.rowCount, 1);
    assert.equal(otherCase.rowCount, 1, "Kode sama boleh dipakai oleh permohonan berbeda");

    const duplicate = await insert(3, 101, "Duplikat", "Tidak boleh menimpa");
    assert.equal(duplicate.rowCount, 0, "Duplikat harus ditolak oleh ON CONFLICT DO NOTHING");
    const existingRace = await Promise.all([
      insert(7, 101, "Duplikat A", "Perubahan A"),
      insert(8, 101, "Duplikat B", "Perubahan B"),
    ]);
    assert.deepEqual(existingRace.map((result) => result.rowCount), [0, 0],
      "Dua duplikat bersamaan tidak boleh mengganti bukti yang sudah ada");
    await assert.rejects(
      pool.query(`INSERT INTO ${table} (id, case_id, code, title, note)
                  VALUES ($1, $2, 'legalitas', $3, $4)`,
        [4, 101, "Duplikat langsung", "Tidak boleh menimpa"]),
      (error) => error.code === "23505" && error.detail?.includes("(case_id, code)"),
      "Insert tanpa ON CONFLICT harus ditolak oleh indeks unik",
    );

    const simultaneous = await Promise.all([
      insert(5, 103, "Penulis A", "Catatan A"),
      insert(6, 103, "Penulis B", "Catatan B"),
    ]);
    assert.deepEqual(simultaneous.map((result) => result.rowCount).sort(), [0, 1],
      "Dua penulisan bersamaan pada permohonan yang sama harus menghasilkan satu bukti");
    const winner = simultaneous.find((result) => result.rowCount === 1).rows[0];

    const { rows } = await pool.query(
      `SELECT id, case_id, code, title, note, updated_at FROM ${table} ORDER BY case_id`,
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.slice(0, 2), [first.rows[0], otherCase.rows[0]],
      "Penulisan duplikat tidak boleh mengubah isi maupun waktu pembaruan yang lama");
    assert.deepEqual(rows[2], winner, "Penulisan yang kalah tidak boleh menimpa pemenang");
  } finally {
    try {
      if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end();
    }
  }
});