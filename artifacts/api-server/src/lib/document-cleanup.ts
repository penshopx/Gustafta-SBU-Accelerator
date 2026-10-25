import { DOCUMENT_CLEANUP_GRACE_MS, DOCUMENT_COMPLETION_WINDOW_MS } from "./document-validation";
import { CleanupBudget, CleanupStopped } from "./document-cleanup-budget";

export interface CleanupRow {
  id: string;
  status: string;
  objectPath: string;
  createdAt: Date;
}
export interface CleanupObject {
  path: string;
  generation: string;
  updatedAt: number;
}
export interface CleanupStorage {
  inspect(path: string): Promise<CleanupObject | undefined>;
  removeGeneration(object: CleanupObject): Promise<boolean>;
}
export interface CleanupCounts {
  scanned: number;
  candidates: number;
  deletedObjects: number;
  expiredReservations: number;
  reservationCandidates: number;
  retained: number;
  failures: number;
  stopped: number;
  timeouts: number;
  operations: number;
  reservationsScanned: number;
}

const managedPath = /^\/objects\/(uploads|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isManagedDocumentPath(path: string) { return managedPath.test(path); }
const finalPath = (id: string) => `/objects/documents/${id}`;

// Caller MUST hold the exclusive transaction-scoped lifecycle lock throughout
// reading rows, inspecting/deleting objects, and removing expired metadata.
// Unknown paths/status/timestamps fail closed. Nothing here logs private data.
// A timed-out DELETE may still finish at the provider after the lock releases.
// This is safe ONLY because expired pending rows can never complete again,
// new reservations use fresh server-generated paths/IDs (never adopt orphans),
// and deletes pin the observed generation. Ready references are never targets.
export async function reconcileDocuments(
  rows: CleanupRow[],
  objects: CleanupObject[],
  storage: CleanupStorage,
  expire: (id: string) => Promise<void>,
  { dryRun, now = Date.now(), reservationOffset = 0, budget = new CleanupBudget() }:
    { dryRun: boolean; now?: number; reservationOffset?: number; budget?: CleanupBudget },
): Promise<CleanupCounts> {
  if (DOCUMENT_CLEANUP_GRACE_MS <= DOCUMENT_COMPLETION_WINDOW_MS) throw new Error("Unsafe cleanup grace");
  const counts: CleanupCounts = { scanned: objects.length, candidates: 0, deletedObjects: 0,
    expiredReservations: 0, reservationCandidates: 0, retained: 0, failures: 0,
    stopped: 0, timeouts: 0, operations: 0, reservationsScanned: 0 };
  const cutoff = now - DOCUMENT_CLEANUP_GRACE_MS;
  const old = (object: CleanupObject) => isManagedDocumentPath(object.path) &&
    !!object.generation && Number.isFinite(object.updatedAt) && object.updatedAt <= cutoff;
  const referenced = new Map<string, CleanupRow[]>();
  for (const row of rows) {
    for (const path of new Set([row.objectPath, finalPath(row.id)])) {
      referenced.set(path, [...(referenced.get(path) ?? []), row]);
    }
  }
  const handled = new Set<string>();
  // Rotate bounded metadata work so fresh replay/permanently failing early rows
  // cannot starve later abandoned reservations.
  const eligible = rows.filter((r) => r.status === "pending" &&
    Number.isFinite(r.createdAt.getTime()) && r.createdAt.getTime() <= cutoff)
    .sort((a, b) => a.id.localeCompare(b.id));
  const offset = eligible.length ? reservationOffset % eligible.length : 0;
  const batch = [...eligible.slice(offset), ...eligible.slice(0, offset)].slice(0, 200);
  try {
    for (const row of batch) {
      budget.check();
      counts.reservationsScanned++;
      const paths = [...new Set([row.objectPath, finalPath(row.id)])];
      if (paths.some((p) => !isManagedDocumentPath(p) ||
        referenced.get(p)?.some((r) => r.id !== row.id))) { counts.retained++; continue; }
      let shouldExpire = false;
      try {
        const snapshots: (CleanupObject | undefined)[] = [];
        for (const path of paths) snapshots.push(await budget.run(() => storage.inspect(path)));
        if (snapshots.some((o) => o && !old(o))) { counts.retained++; continue; }
        counts.reservationCandidates++;
        counts.candidates += snapshots.filter(Boolean).length;
        let unchanged = true;
        for (const object of snapshots) {
          if (!object) continue;
          handled.add(object.path);
          if (!dryRun) {
            if (await budget.run(() => storage.removeGeneration(object))) counts.deletedObjects++;
            else { unchanged = false; counts.retained++; }
          }
        }
        // A failed/changed-generation deletion keeps the reservation for retry.
        shouldExpire = !dryRun && unchanged;
      } catch (error) {
        if (error instanceof CleanupStopped) throw error;
        counts.failures++;
      }
      if (shouldExpire) {
        budget.check();
        // Database errors abort the transaction. Do not treat them as a
        // recoverable storage failure and continue deleting other objects.
        await expire(row.id);
        counts.expiredReservations++;
      }
    }
    for (const object of objects) {
      budget.check();
      if (handled.has(object.path)) continue;
      if (!old(object) || referenced.has(object.path)) { counts.retained++; continue; }
      counts.candidates++;
      if (dryRun) continue;
      try {
        if (await budget.run(() => storage.removeGeneration(object))) counts.deletedObjects++;
        else counts.retained++;
      } catch (error) {
        if (error instanceof CleanupStopped) throw error;
        counts.failures++;
      }
    }
  } catch (error) {
    if (!(error instanceof CleanupStopped)) throw error;
  }
  counts.stopped = budget.stopped;
  counts.timeouts = budget.timeouts;
  counts.operations = budget.operations;
  return counts;
}
