// Test-only CLI; not mounted by the app. Accept fixtures on stdin, never secrets.
import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import { documentStorage } from "../../src/lib/document-storage";

const emailPattern = /^draft-[ab]-\d+-(profile|case-create|evidence-create|evidence-edit)-[a-z0-9]+@example\.com$/;

export async function cleanupFormOwnerFixtures(fixtures, { removeTestDocuments = false } = {}) {
  if (!Array.isArray(fixtures)) throw new Error("Expected a fixture array");
  const allowedEmails = new Set();
  const suppliedIds = new Set();
  for (const fixture of fixtures) {
    if (!Array.isArray(fixture.emails) || !Array.isArray(fixture.owners)) {
      throw new Error("Invalid cleanup fixture");
    }
    for (const email of fixture.emails) {
      if (typeof email !== "string" || !emailPattern.test(email)) {
        throw new Error("Refusing non-synthetic cleanup email");
      }
      allowedEmails.add(email);
    }
    for (const id of fixture.owners) suppliedIds.add(id);
  }
  const verifiedIds = new Set();
  // Email lookup also handles sign-in succeeding before the owner was recorded.
  for (const email of allowedEmails) {
    const users = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
    if (users.totalCount > 1) throw new Error("Ambiguous synthetic account");
    for (const user of users.data) {
      if (!user.emailAddresses.some(address => address.emailAddress === email)) {
        throw new Error("Clerk returned an unexpected account");
      }
      verifiedIds.add(user.id);
    }
  }
  // A supplied ID must still exist as an exact synthetic-email match. Fail
  // before any deletion if a caller accidentally supplies a different owner.
  for (const id of suppliedIds) {
    const user = await clerkClient.users.getUser(id);
    if (!user.emailAddresses.some(address => allowedEmails.has(address.emailAddress))) {
      throw new Error("Refusing unrelated owner cleanup");
    }
    verifiedIds.add(id);
  }
  const ids = [...verifiedIds];
  if (!ids.length) return { cleaned: true, accounts: 0, remainingProfiles: 0 };
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    // Default remains fail-closed. Vault tests must explicitly opt into removing
    // objects AFTER exact synthetic Clerk emails and IDs have been verified.
    if (removeTestDocuments) {
      const files = await connection.query(
        "SELECT object_path FROM sbu_documents WHERE owner_id = ANY($1::text[]) FOR UPDATE", [ids],
      );
      for (const file of files.rows) await documentStorage.remove(file.object_path);
      await connection.query("DELETE FROM sbu_documents WHERE owner_id = ANY($1::text[])", [ids]);
    }
    const documents = await connection.query(
      "SELECT 1 FROM sbu_documents WHERE owner_id = ANY($1::text[]) LIMIT 1", [ids],
    );
    if (documents.rowCount) throw new Error("Unexpected document attachment; explicit storage cleanup required");
    await connection.query("DELETE FROM sbu_evidence WHERE case_id IN (SELECT id FROM sbu_cases WHERE owner_id = ANY($1::text[]))", [ids]);
    await connection.query("DELETE FROM sbu_cases WHERE owner_id = ANY($1::text[])", [ids]);
    await connection.query("DELETE FROM sbu_company_profiles WHERE owner_id = ANY($1::text[])", [ids]);
    await connection.query("DELETE FROM sbu_audit_logs WHERE user_id = ANY($1::text[]) OR org_id IN (SELECT id FROM sbu_workspaces WHERE owner_id = ANY($1::text[]))", [ids]);
    await connection.query("DELETE FROM sbu_clients WHERE org_id IN (SELECT id FROM sbu_workspaces WHERE owner_id = ANY($1::text[]))", [ids]);
    await connection.query("DELETE FROM sbu_workspaces WHERE owner_id = ANY($1::text[])", [ids]);
    await connection.query("DELETE FROM sbu_profiles WHERE user_id = ANY($1::text[])", [ids]);
    const remaining = await connection.query(
      "SELECT count(*)::int AS n FROM sbu_profiles WHERE user_id = ANY($1::text[])", [ids],
    );
    if (remaining.rows[0].n !== 0) throw new Error("Matching profiles remain");
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
  for (const id of ids) await clerkClient.users.deleteUser(id);
  for (const email of allowedEmails) {
    const remaining = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
    if (remaining.totalCount !== 0) throw new Error("Synthetic Clerk account remains");
  }
  return { cleaned: true, accounts: ids.length, remainingProfiles: 0 };
}

// Deliberately opt-in: importing this helper never deletes anything.
if (process.argv.includes("--stdin")) {
  try {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    console.log(JSON.stringify(await cleanupFormOwnerFixtures(JSON.parse(input), {
      removeTestDocuments: process.argv.includes("--remove-test-documents"),
    })));
  } catch {
    // Avoid SDK errors that might embed account identifiers in saved logs.
    console.error("Scoped form-owner fixture cleanup failed; keep fixtures in memory and investigate.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
