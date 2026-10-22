import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createRestrictedRoutePool } from "./restricted-postgres.mjs";

// Exercise real socket loss, not a permission error or a substituted query result.
export async function exerciseSummaryConnectionLoss({
  admin, schema, request, content, assertBefore, boundary, installPool,
}) {
  const restricted = await createRestrictedRoutePool(admin, schema);
  const { pool } = restricted;
  const applicationName = `summary_disconnect_${randomUUID()}`;
  const connect = pool.connect.bind(pool);
  const events = [];
  const clientErrors = [];
  const removed = [];
  const idleErrors = [];
  let role;
  let terminate = false;
  let terminatedPid;
  let restore;
  pool.on("remove", client => removed.push(client.processID));
  pool.on("error", error => idleErrors.push(error));
  try {
    // Discard the helper's spare connection. Retry must create a physical
    // replacement, rather than merely using a second prewarmed healthy client.
    const first = await connect();
    try {
      const spare = await connect();
      spare.release(true);
    } finally {
      first.release();
    }
    const adminPid = (await admin.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    pool.connect = async () => {
      const client = await connect();
      const rawQuery = client.query;
      const release = client.release;
      let identity;
      try {
        identity = (await rawQuery.call(client, `
          SELECT pg_backend_pid() AS pid, current_user, session_user,
                 current_schema() AS schema, current_database() AS database
        `)).rows[0];
        assert.match(identity.current_user, /^sbu_route_test_[a-f0-9]+$/);
        role ??= identity.current_user;
        assert.equal(identity.current_user, role);
        assert.equal(identity.session_user, role);
        assert.equal(identity.schema, schema);
        assert.equal(identity.pid, client.processID);
        assert.notEqual(identity.pid, adminPid);
        assert.notEqual(identity.pid, terminatedPid);
        const { rows: targets } = await rawQuery.call(client, `
          SELECT c.relname AS table_name, n.nspname AS schema
          FROM unnest($1::text[]) AS t(name)
          JOIN pg_class c ON c.oid = to_regclass(t.name)
          JOIN pg_namespace n ON n.oid = c.relnamespace
          ORDER BY c.relname
        `, [["sbu_cases", "sbu_evidence", "sbu_transition_verifications", "sbu_personnel"]]);
        assert.equal(targets.length, 4);
        assert.ok(targets.every(target => target.schema === schema),
          "Setiap pembacaan harus menuju salinan fixture sebelum sesi boleh diputus");
        await rawQuery.call(client, "SELECT set_config('application_name', $1, false)", [applicationName]);
      } catch (error) {
        release.call(client, error);
        throw error;
      }
      const checkout = { pid: identity.pid, statements: [], releases: 0 };
      events.push(checkout);
      const onError = error => clientErrors.push({ pid: identity.pid, error });
      client.on("error", onError);
      client.query = async (...args) => {
        const sql = typeof args[0] === "string" ? args[0] : args[0].text;
        const statement = { sql };
        checkout.statements.push(statement);
        let result;
        try {
          result = await rawQuery.apply(client, args);
          statement.command = result.command;
        } catch (error) {
          statement.error = error;
          throw error;
        }
        if (terminate && new RegExp(`^\\s*select\\b.*from "${boundary}"`, "is").test(sql)) {
          terminate = false;
          // Check the exact session again from the independent administrator
          // connection; backend_start guards against PID reuse. Never select
          // a target by application role, query text, or PID alone.
          const { rows: [activity] } = await admin.query(`
            SELECT pid, usename, datname, application_name, backend_start::text,
                   state, xact_start IS NOT NULL AS in_transaction
            FROM pg_stat_activity
            WHERE pid = $1 AND backend_type = 'client backend'
          `, [identity.pid]);
          assert.ok(activity);
          assert.equal(activity.usename, role);
          assert.equal(activity.datname, identity.database);
          assert.equal(activity.application_name, applicationName);
          assert.equal(activity.state, "idle in transaction");
          assert.equal(activity.in_transaction, true);
          const lost = once(client, "error", { signal: AbortSignal.timeout(5_000) });
          // Attach a rejection handler immediately in case a safety assertion
          // fails before the event is awaited.
          lost.catch(() => {});
          const { rows: killed } = await admin.query(`
            SELECT pg_terminate_backend(pid) AS terminated
            FROM pg_stat_activity
            WHERE pid = $1 AND pid <> pg_backend_pid()
              AND usename = $2 AND datname = $3 AND application_name = $4
              AND backend_start = $5::timestamptz
              AND backend_type = 'client backend'
              AND state = 'idle in transaction' AND xact_start IS NOT NULL
          `, [identity.pid, role, identity.database, applicationName, activity.backend_start]);
          assert.deepEqual(killed, [{ terminated: true }]);
          terminatedPid = identity.pid;
          const [error] = await lost;
          assert.equal(error.code, "57P01", "PostgreSQL sendiri harus mengakhiri sesi fixture");
        }
        return result;
      };
      client.release = (...args) => {
        checkout.releases++;
        client.query = rawQuery;
        client.release = release;
        client.removeListener("error", onError);
        return release.apply(client, args);
      };
      return client;
    };
    restore = installPool(pool);
    const baseline = await request();
    assert.equal(baseline.response.status, 200, baseline.html);
    assertBefore(baseline.html);
    assert.equal(events.length, 1);
    terminate = true;
    const failed = await request();
    assert.equal(failed.response.status, 500, failed.html);
    assert.equal(failed.response.headers.get("cache-control"), "private, no-store");
    assert.equal(failed.response.headers.get("content-disposition"), null);
    assert.equal(failed.response.headers.get("content-security-policy"), "default-src 'none'");
    assert.match(failed.html, /Internal Server Error/);
    assert.doesNotMatch(failed.html,
      /Perusahaan|Judul privat|Surat Sebelum|ringkasan-persiapan-sbu|Snapshot|catatan deklarasi/);
    assert.equal(events.length, 2);
    assert.equal(terminatedPid, events[0].pid, "Kegagalan harus mengenai koneksi baseline");
    assert.equal(events[1].pid, terminatedPid);
    assert.equal(events[1].releases, 1);
    assert.equal(clientErrors.length, 1);
    assert.equal(clientErrors[0].pid, terminatedPid);
    assert.equal(clientErrors[0].error.code, "57P01");
    const statements = events[1].statements;
    const successfulReads = boundary === "sbu_cases"
      ? ["sbu_cases"] : ["sbu_cases", "sbu_evidence"];
    assert.match(statements[0].sql, /^begin isolation level repeatable read read only$/i);
    assert.equal(statements[0].command, "BEGIN");
    for (const [index, table] of successfulReads.entries()) {
      assert.match(statements[index + 1].sql, new RegExp(`from "${table}"`, "i"));
      assert.equal(statements[index + 1].command, "SELECT");
    }
    const following = statements.slice(successfulReads.length + 1);
    assert.equal(following.length, 2);
    assert.match(following[0].sql, new RegExp(
      `from "${boundary === "sbu_cases" ? "sbu_evidence" : "sbu_transition_verifications"}"`, "i"));
    assert.match(following[0].error.message, /not queryable|connection.*(?:closed|terminated)/i);
    assert.equal(following[1].sql, "rollback");
    assert.ok(following[1].error, "ROLLBACK tidak dapat berhasil pada koneksi yang sudah putus");
    assert.ok(removed.includes(terminatedPid), "Pool harus membuang koneksi rusak");
    assert.equal(pool.totalCount, 0);
    assert.equal(pool.idleCount, 0, "Koneksi rusak tidak boleh tersedia sebagai koneksi sehat");
    assert.equal(pool.waitingCount, 0);

    const recovered = await request();
    assert.equal(recovered.response.status, 200, recovered.html);
    assert.equal(recovered.response.headers.get("cache-control"), "private, no-store");
    assert.match(recovered.response.headers.get("content-type"), /^text\/html\b/);
    assert.equal(recovered.response.headers.get("content-disposition"),
      'attachment; filename="ringkasan-persiapan-sbu.html"');
    assertBefore(recovered.html);
    assert.equal(content(recovered.html), content(baseline.html));
    assert.equal(events.length, 3);
    const replacement = events[2];
    assert.notEqual(replacement.pid, terminatedPid);
    assert.equal(replacement.statements.at(-1).command, "COMMIT");
    assert.equal(replacement.releases, 1);
    assert.ok(replacement.statements.every(statement => !statement.error));
    assert.equal(pool.totalCount, 1);
    assert.equal(pool.idleCount, 1);
    assert.deepEqual(idleErrors, []);
    const { rows: activity } = await admin.query(`
      SELECT pid, state, xact_start FROM pg_stat_activity WHERE usename = $1
    `, [role]);
    assert.deepEqual(activity, [{ pid: replacement.pid, state: "idle", xact_start: null }]);
  } finally {
    restore?.();
    await restricted.close();
    assert.equal(pool.ended, true);
    assert.equal(pool.totalCount, 0);
    assert.equal(pool.idleCount, 0);
    assert.equal(pool.waitingCount, 0);
    if (role) {
      assert.equal((await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount, 0);
      assert.equal((await admin.query("SELECT 1 FROM pg_stat_activity WHERE usename = $1", [role])).rowCount, 0,
        "Teardown tidak boleh menyisakan backend fixture");
    }
  }
}
