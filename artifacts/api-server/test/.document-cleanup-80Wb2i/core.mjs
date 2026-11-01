// src/lib/document-validation.ts
import { PDFDocument } from "pdf-lib";
var MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
var DOCUMENT_COMPLETION_WINDOW_MS = 30 * 6e4;
var DOCUMENT_CLEANUP_GRACE_MS = 48 * 60 * 6e4;

// src/lib/document-cleanup-budget.ts
import { performance } from "node:perf_hooks";
var CleanupStopped = class extends Error {
  constructor() {
    super("Document cleanup stopped");
  }
};
var CleanupBudget = class {
  deadline;
  operationMs;
  maxOperations;
  operations = 0;
  stopped = 0;
  timeouts = 0;
  constructor({ roundMs = 1e4, operationMs = 2e3, maxOperations = 1e3 } = {}) {
    if (![roundMs, operationMs, maxOperations].every((n) => Number.isSafeInteger(n) && n > 0)) {
      throw new Error("Invalid cleanup budget");
    }
    this.deadline = performance.now() + roundMs;
    this.operationMs = operationMs;
    this.maxOperations = maxOperations;
  }
  check() {
    if (this.stopped || performance.now() >= this.deadline) {
      this.stopped = 1;
      throw new CleanupStopped();
    }
  }
  async run(operation) {
    this.check();
    if (this.operations >= this.maxOperations) {
      this.stopped = 1;
      throw new CleanupStopped();
    }
    this.operations++;
    let timer;
    try {
      const result = await Promise.race([
        // Invoke only after checking the gate; no queued follow-up operations
        // can start when a timed-out promise eventually settles.
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.stopped = 1;
            this.timeouts++;
            reject(new CleanupStopped());
          }, Math.min(this.operationMs, Math.max(1, this.deadline - performance.now())));
        })
      ]);
      this.check();
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
};

// src/lib/document-cleanup.ts
var managedPath = /^\/objects\/(uploads|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function isManagedDocumentPath(path) {
  return managedPath.test(path);
}
var finalPath = (id) => `/objects/documents/${id}`;
async function reconcileDocuments(rows, objects, storage, expire, { dryRun, now = Date.now(), reservationOffset = 0, budget = new CleanupBudget() }) {
  if (DOCUMENT_CLEANUP_GRACE_MS <= DOCUMENT_COMPLETION_WINDOW_MS) throw new Error("Unsafe cleanup grace");
  const counts = {
    scanned: objects.length,
    candidates: 0,
    deletedObjects: 0,
    expiredReservations: 0,
    reservationCandidates: 0,
    retained: 0,
    failures: 0,
    stopped: 0,
    timeouts: 0,
    operations: 0,
    reservationsScanned: 0
  };
  const cutoff = now - DOCUMENT_CLEANUP_GRACE_MS;
  const old = (object) => isManagedDocumentPath(object.path) && !!object.generation && Number.isFinite(object.updatedAt) && object.updatedAt <= cutoff;
  const referenced = /* @__PURE__ */ new Map();
  for (const row of rows) {
    for (const path of /* @__PURE__ */ new Set([row.objectPath, finalPath(row.id)])) {
      referenced.set(path, [...referenced.get(path) ?? [], row]);
    }
  }
  const handled = /* @__PURE__ */ new Set();
  const eligible = rows.filter((r) => r.status === "pending" && Number.isFinite(r.createdAt.getTime()) && r.createdAt.getTime() <= cutoff).sort((a, b) => a.id.localeCompare(b.id));
  const offset = eligible.length ? reservationOffset % eligible.length : 0;
  const batch = [...eligible.slice(offset), ...eligible.slice(0, offset)].slice(0, 200);
  try {
    for (const row of batch) {
      budget.check();
      counts.reservationsScanned++;
      const paths = [.../* @__PURE__ */ new Set([row.objectPath, finalPath(row.id)])];
      if (paths.some((p) => !isManagedDocumentPath(p) || referenced.get(p)?.some((r) => r.id !== row.id))) {
        counts.retained++;
        continue;
      }
      let shouldExpire = false;
      try {
        const snapshots = [];
        for (const path of paths) snapshots.push(await budget.run(() => storage.inspect(path)));
        if (snapshots.some((o) => o && !old(o))) {
          counts.retained++;
          continue;
        }
        counts.reservationCandidates++;
        counts.candidates += snapshots.filter(Boolean).length;
        let unchanged = true;
        for (const object of snapshots) {
          if (!object) continue;
          handled.add(object.path);
          if (!dryRun) {
            if (await budget.run(() => storage.removeGeneration(object))) counts.deletedObjects++;
            else {
              unchanged = false;
              counts.retained++;
            }
          }
        }
        shouldExpire = !dryRun && unchanged;
      } catch (error) {
        if (error instanceof CleanupStopped) throw error;
        counts.failures++;
      }
      if (shouldExpire) {
        budget.check();
        await expire(row.id);
        counts.expiredReservations++;
      }
    }
    for (const object of objects) {
      budget.check();
      if (handled.has(object.path)) continue;
      if (!old(object) || referenced.has(object.path)) {
        counts.retained++;
        continue;
      }
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
export {
  CleanupBudget,
  CleanupStopped,
  isManagedDocumentPath,
  reconcileDocuments
};
