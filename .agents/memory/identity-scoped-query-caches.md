---
name: Identity-scoped query caches
description: Why authenticated frontend cache ownership must change synchronously with identity
---

Keep private query caches owned by the current authenticated identity. When identity changes, mount a fresh cache before rendering private views, and dispose the old one after unmount.

**Why:** An auth listener or effect that clears a shared cache runs after a render may already have read stale data under the same query keys. This can briefly display another account's private profile, cases, or dashboard.

**How to apply:** Gate private rendering until auth identity is loaded; key the provider by identity rather than relying only on invalidation, and cover the loading interval as well as the final account view in regression checks.

## Session readiness versus auxiliary profile loading

Tie private cache ownership to the authenticated session identity, not readiness of an auxiliary identity-provider user profile. Keep the independent server-owner agreement check before rendering private routes, and bound both authentication initialization and identity requests.

**Why:** An auxiliary profile is not needed to establish the private cache owner. Its loading transitions should not repeatedly discard verification errors or restart requests. A stalled request must resolve to a closed, recoverable error state, never an indefinitely loading or permissive fallback.

**How to apply:** Preserve focus-based session revalidation. Treat authentication rejection as a user-recovery action rather than an automatic retry loop. A Preview recovery test does not prove that a specific production session has recovered.