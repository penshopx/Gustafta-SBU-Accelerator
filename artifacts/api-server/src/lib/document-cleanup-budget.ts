import { performance } from "node:perf_hooks";

export interface CleanupBudgetOptions {
  roundMs?: number;
  operationMs?: number;
  maxOperations?: number;
}

export class CleanupStopped extends Error {
  constructor() { super("Document cleanup stopped"); }
}

// A wall-clock deadline alone does not bound an unresponsive storage promise.
// Race each call too, and permanently close the gate when either limit is hit.
export class CleanupBudget {
  private readonly deadline: number;
  private readonly operationMs: number;
  private readonly maxOperations: number;
  operations = 0;
  stopped = 0;
  timeouts = 0;

  constructor({ roundMs = 10_000, operationMs = 2_000, maxOperations = 1_000 }: CleanupBudgetOptions = {}) {
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

  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.check();
    if (this.operations >= this.maxOperations) {
      this.stopped = 1;
      throw new CleanupStopped();
    }
    this.operations++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        // Invoke only after checking the gate; no queued follow-up operations
        // can start when a timed-out promise eventually settles.
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.stopped = 1;
            this.timeouts++;
            reject(new CleanupStopped());
          }, Math.min(this.operationMs, Math.max(1, this.deadline - performance.now())));
        }),
      ]);
      this.check();
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
