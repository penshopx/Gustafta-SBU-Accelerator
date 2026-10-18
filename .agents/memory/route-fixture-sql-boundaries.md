---
name: Route fixture SQL boundaries
description: Distinguish SQL expression construction from database execution in isolated route tests.
---

Database mocks for bundled route tests must distinguish module-level SQL expression construction from actual database execution.

**Why:** A fixture that throws on every SQL template call can prevent a route suite from loading when unrelated imported modules declare advisory-lock expressions, even though no database query ran.

**How to apply:** Permit only known inert declarations needed for module loading, keep unexpected SQL expressions and execution fail-closed, and do not replace the route under test with a stub just to make its imports succeed.
