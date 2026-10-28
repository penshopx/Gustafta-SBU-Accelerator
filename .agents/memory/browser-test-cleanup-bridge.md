---
name: Browser test cleanup bridge
description: Separating Clerk browser sign-in helpers from server-side synthetic account cleanup
---

Do not assume the browser-testing notebook exposes a server-side Clerk client.
Its sign-in helper can create synthetic users but cannot by itself delete them.
Provide a scoped host-side cleanup adapter before starting account-creating
regressions; the adapter should use the existing server environment internally
and verify exact run-generated synthetic emails before deleting any user.

**Why:** Browser testing was blocked by a missing Clerk cleanup binding even
though programmatic sign-in and parameterized database queries were available.
Starting anyway would risk leaking temporary accounts. No credentials should
be copied into the browser notebook to solve this.

**How to apply:** Establish the cleanup handoff before launching multi-account
tests. The notebook can stage a private temporary fixture payload, then the
host-side CLI performs its own single-connection database transaction and
Clerk cleanup. Keep cleanup failure separate from the primary test failure,
remove the private payload after success, and report only sanitized counts.

Before creating accounts, execute the cleanup entrypoint with an empty fixture
list to confirm the adapter actually loads in its execution environment; checking
that a runner exists is not enough.

**Why:** A cleanup adapter can fail before reaching its scoped checks because a
TypeScript runner is unavailable or a bundled script cannot resolve dependencies
from its output directory. Discovering that after seeding leaves avoidable fixtures.

**How to apply:** Treat the empty run as a dependency-loading check, not proof of
Clerk delete permissions or successful cleanup. Real scoped cleanup still needs
its own result and remaining-fixture checks.

Stage exact synthetic fixture emails privately before attempting sign-in, not
only in a runner's final cleanup. Keep each browser-notebook action below its
execution limit by running independently cleanable scenarios separately.

**Why:** A notebook worker can reset at its action timeout without completing
the runner's `finally`, losing in-memory cleanup scope and intermediate results.
Account creation can succeed even when its sign-in navigation has not finished.

**How to apply:** Checkpoint the scoped cleanup handoff before creating accounts,
update it after owner discovery, and remove it only after successful host-side
cleanup. Wait explicitly for the real shared session cookie after sign-in;
navigation completion alone does not establish that the ticket exchange finished.

Validate the checkpoint's outer structure before handing it to the cleanup CLI;
an individual fixture object and a list of fixtures are not interchangeable.

**Why:** A tester can preserve the correct account scope but write a single
object where the host cleanup contract requires a list, preventing cleanup.

**How to apply:** Check the payload shape without logging its identifiers, and
normalize only the outer container; never broaden the exact synthetic scope.
