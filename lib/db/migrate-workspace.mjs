import { readFile } from "node:fs/promises";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const sql = await readFile(new URL("./migrations/workspace-foundation.sql", import.meta.url), "utf8");
  await pool.query(sql);
  const documentsSql = await readFile(new URL("./migrations/standalone-documents.sql", import.meta.url), "utf8");
  await pool.query(documentsSql);
  await pool.query(await readFile(new URL("./migrations/document-malware.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/document-analysis-pages.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/consultations.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/personnel.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/workroom.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/smap-checklist.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/workroom-reviews.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/chat-quota.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/ai-budget.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/document-analysis-operations.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/chat-source-reviews.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/antivirus-signature-incidents.sql", import.meta.url), "utf8"));
  process.stdout.write("Workspace foundation migration complete; existing cases preserved.\n");
} catch {
  // Do not print database credentials or connection errors.
  process.stderr.write("Workspace foundation migration failed. Server was not started.\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
