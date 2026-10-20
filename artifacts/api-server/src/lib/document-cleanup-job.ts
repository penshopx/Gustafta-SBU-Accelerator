import { db, documentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { documentStorage, type CleanupCursor } from "./document-storage";
import { documentCleanupLock } from "./document-lifecycle-lock";
import { reconcileDocuments } from "./document-cleanup";
import { logger } from "./logger";
import { CleanupBudget, CleanupStopped, type CleanupBudgetOptions } from "./document-cleanup-budget";

const INTERVAL_MS = 60 * 60_000;
let cursor: CleanupCursor = { namespace: "uploads" };
let reservationOffset = 0;

export async function runDocumentCleanup(dryRun: boolean, limits?: CleanupBudgetOptions) {
  return db.transaction(async (tx) => {
    const lock = await tx.execute(documentCleanupLock);
    if (!lock.rows[0]?.acquired) return { skipped: 1 };
    const budget = new CleanupBudget(limits);
    // All mutation paths take the shared lock before touching metadata/storage.
    // A failed DB read/listing aborts without deletion; ready references are
    // retained regardless of age, including final paths implied by pending IDs.
    const rows = await tx.select({
      id: documentsTable.id, status: documentsTable.status,
      objectPath: documentsTable.objectPath, createdAt: documentsTable.createdAt,
    }).from(documentsTable);
    let page;
    try {
      page = await budget.run(() => documentStorage.listCleanupObjects(cursor));
    } catch (error) {
      if (!(error instanceof CleanupStopped)) throw error;
      return { stopped: 1, timeouts: budget.timeouts, operations: budget.operations };
    }
    const counts = await reconcileDocuments(rows, page.objects, documentStorage, async (id) => {
      await tx.delete(documentsTable).where(and(eq(documentsTable.id, id), eq(documentsTable.status, "pending")));
    }, { dryRun, reservationOffset, budget });
    // Never skip the unprocessed portion of a page. Rotate reservations even
    // after a stop so a persistently slow first row cannot monopolize each run.
    if (!counts.stopped) cursor = page.nextCursor;
    reservationOffset += counts.reservationsScanned;
    return counts;
  });
}

// One timer in the existing API workflow, not a duplicate web service.
// Startup + hourly, with database exclusion across replicas and local overlap
// prevention. No exception payloads, paths, names, or identities in logs.
export function startDocumentCleanup() {
  const mode = process.env.SBU_DOCUMENT_CLEANUP_MODE ?? "delete";
  if (!["delete", "dry-run", "off"].includes(mode)) throw new Error("Invalid document cleanup mode");
  if (mode === "off") return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const counts = await runDocumentCleanup(mode === "dry-run");
      logger.info({ ...counts, dryRuns: mode === "dry-run" ? 1 : 0 }, "Document cleanup counts");
    } catch {
      logger.warn({ failures: 1 }, "Document cleanup counts");
    } finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
