import { sql } from "drizzle-orm";

// Shared by every API replica. Acquire BEFORE row locks; rollback/crash releases
// the lock automatically. Concurrent owners may upload while cleanup skips.
// Cleanup bounds storage waits before releasing this lock. Do not allow an
// expired pending row to become ready or reuse an orphan's path: a provider may
// still finish a generation-pinned DELETE after the cleanup deadline.
export const documentActivityLock = sql`SELECT pg_advisory_xact_lock_shared(137, 1)`;
export const documentCleanupLock = sql`SELECT pg_try_advisory_xact_lock(137, 1) AS acquired`;
