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
