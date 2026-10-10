import { sql } from "drizzle-orm";

// Shared by every API replica. Acquire BEFORE row locks; rollback/crash releases
// the lock automatically. Concurrent owners may upload while cleanup skips.
export const documentActivityLock = sql`SELECT pg_advisory_xact_lock_shared(137, 1)`;
export const documentCleanupLock = sql`SELECT pg_try_advisory_xact_lock(137, 1) AS acquired`;
