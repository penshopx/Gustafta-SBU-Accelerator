---
name: Identity-scoped query caches
description: Why authenticated frontend cache ownership must change synchronously with identity
---

Keep private query caches owned by the current authenticated identity. When identity changes, mount a fresh cache before rendering private views, and dispose the old one after unmount.

**Why:** An auth listener or effect that clears a shared cache runs after a render may already have read stale data under the same query keys. This can briefly display another account's private profile, cases, or dashboard.

**How to apply:** Gate private rendering until auth identity is loaded; key the provider by identity rather than relying only on invalidation, and cover the loading interval as well as the final account view in regression checks.