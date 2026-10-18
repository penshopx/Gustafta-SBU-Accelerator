---
name: Node test child processes
description: Fresh Node test runners must not inherit the parent runner's internal context.
---

Remove `NODE_TEST_CONTEXT` from the environment when spawning a fresh `node --test` runner inside a test. Assert that the child actually executed the intended test, not just that it exited successfully.

**Why:** Inheriting `NODE_TEST_CONTEXT=child-v8` causes Node to skip recursive test execution with a warning while still exiting with status zero. This can silently invalidate time-zone regression checks.

**How to apply:** Set `TZ` before child imports, clear the internal context in the child's environment, select the intended test, and check a stable reporter's passed-test count as well as the exit status.
