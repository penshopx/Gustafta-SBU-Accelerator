import { readFile } from "node:fs/promises";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const sql = await readFile(new URL("./migrations/workspace-foundation.sql", import.meta.url), "utf8");
  await pool.query(sql);
  process.stdout.write("Workspace foundation migration complete; existing cases preserved.\n");
} catch {
  // Do not print database credentials or connection errors.
  process.stderr.write("Workspace foundation migration failed. Server was not started.\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
