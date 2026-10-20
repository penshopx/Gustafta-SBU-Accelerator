---
name: Node test asynchronous setup
description: Root teardown can run prematurely if a test is registered before awaited module setup
---

Register tests only after asynchronous module setup has completed when root teardown owns shared instrumentation.

**Why:** Node's test runner executed an early registered test while a top-level bundle build was still awaiting completion, then ran root teardown before later tests were registered. A warning interceptor was restored before real middleware requests, making a seemingly passing guard ineffective.

**How to apply:** Keep guard installation before application imports, but delay test registration until awaited setup completes. Verify instrumentation with a deliberate real warning; an isolated mock test alone does not prove the guard remains active during integration requests.

## Failing root teardown hooks

Restore shared instrumentation and clean up temporary resources together before running teardown assertions; do not rely on subsequent root `after` hooks for cleanup.

**Why:** With Node 24, a deliberate swallowed-network probe caused the first root teardown assertion to fail and later root teardown hooks were skipped. Separate cleanup hooks therefore cannot guarantee restoration on a guard failure.

**How to apply:** Put mandatory restoration and resource cleanup in one teardown, ahead of assertions (using `finally` where needed). Verify restoration after a failing run from a process-exit probe rather than another root teardown hook.

## Awaited nested tests

Register an awaited nested test on its immediate parent's test context, not an ancestor's context.

**Why:** The ancestor queues that test as a sibling of the currently running child. If the child awaits the queued sibling, both wait indefinitely; open HTTP servers can also prevent timeout teardown from completing.

**How to apply:** Accept the local test context in each callback that registers nested tests. When a route test stalls with idle database connections, check the test-context nesting before investigating database locks.
