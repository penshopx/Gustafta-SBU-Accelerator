---
name: Embedded media verification
description: Verify film playback inside its embedding context, not just the standalone route.
---

A working standalone film URL is not sufficient proof that the embedded
landing-page player works.

**Why:** The user showed a failed frame inside the workspace preview while
the same film played when opened directly in development and production.
Do not infer that the reported problem is resolved merely from HTTP 200.

**How to apply:** Check the embedded document after the play click and confirm
that its timeline advances. Include bounded loading, visible failure/retry,
and a standalone fallback. When embedding application-owned HTML, preserve
asset base paths and never apply that trust to user-supplied HTML.

Check overflow and control visibility inside the frame as well as outside it.

**Why:** The landing page fit the mobile viewport while the film's own document
was wider than its frame, clipping playback controls. An outer-page width
check alone missed the problem.

**How to apply:** Measure the inner document's scroll width against its viewport
and check all control bounds at the embedded width, not only at the phone's
full viewport width.
