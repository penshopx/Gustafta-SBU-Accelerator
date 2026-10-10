import { DOCUMENT_CLEANUP_GRACE_MS } from "./document-validation";

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
}

const managedPath = /^\/objects\/(uploads|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isManagedDocumentPath(path: string) { return managedPath.test(path); }
const finalPath = (id: string) => `/objects/documents/${id}`;

// Caller MUST hold the exclusive transaction-scoped lifecycle lock throughout
// reading rows, inspecting/deleting objects, and removing expired metadata.
// Unknown paths/status/timestamps fail closed. Nothing here logs private data.
export async function reconcileDocuments(
  rows: CleanupRow[],
  objects: CleanupObject[],
  storage: CleanupStorage,
  expire: (id: string) => Promise<void>,
  { dryRun, now = Date.now(), reservationOffset = 0 }: { dryRun: boolean; now?: number; reservationOffset?: number },
): Promise<CleanupCounts> {
  const counts: CleanupCounts = { scanned: objects.length, candidates: 0, deletedObjects: 0,
    expiredReservations: 0, reservationCandidates: 0, retained: 0, failures: 0 };
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
  for (const row of batch) {
    const paths = [...new Set([row.objectPath, finalPath(row.id)])];
    if (paths.some((p) => !isManagedDocumentPath(p) ||
      referenced.get(p)?.some((r) => r.id !== row.id))) { counts.retained++; continue; }
    try {
      const snapshots = await Promise.all(paths.map((p) => storage.inspect(p)));
      if (snapshots.some((o) => o && !old(o))) { counts.retained++; continue; }
      counts.reservationCandidates++;
      counts.candidates += snapshots.filter(Boolean).length;
      let unchanged = true;
      for (const object of snapshots) {
        if (!object) continue;
        handled.add(object.path);
        if (!dryRun) {
          if (await storage.removeGeneration(object)) counts.deletedObjects++;
          else { unchanged = false; counts.retained++; }
        }
      }
      // A failed/changed-generation deletion keeps the reservation for retry.
      if (!dryRun && unchanged) { await expire(row.id); counts.expiredReservations++; }
    } catch { counts.failures++; }
  }
  for (const object of objects) {
    if (handled.has(object.path)) continue;
    if (!old(object) || referenced.has(object.path)) { counts.retained++; continue; }
    counts.candidates++;
    if (dryRun) continue;
    try {
      if (await storage.removeGeneration(object)) counts.deletedObjects++;
      else counts.retained++;
    } catch { counts.failures++; }
  }
  return counts;
}
