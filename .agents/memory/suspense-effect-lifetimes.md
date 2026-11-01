---
name: Suspense effect lifetimes
description: Hidden React routes may retain passive effects and pending external side effects.
---

Bind pending exports to the active route and visible component lifetime, not just unmount.

**Why:** React Suspense can hide a committed subtree while retaining its passive effects. An abort registered only in passive cleanup may therefore leave an old export alive. Transport cancellation alone also does not prove that a late result cannot trigger a download.

**How to apply:** For route-scoped external side effects, invalidate work on route changes and layout cleanup (including Suspense hiding). Check context again immediately before creating output. Keep a regression whose transport deliberately settles after abort, so suppression is tested independently of network cancellation.
