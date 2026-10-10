---
name: Form owner preconditions
description: Preventing old drafts from being written through a different account's shared cookie
---

Bind a mutation to the authenticated account that opened its draft, and reject a different cookie-backed owner on the server before accessing persistence. Never refresh the draft's owner when dispatching or retrying.

Form identity binding complements, never replaces, resource ownership checks. A matching client precondition does not grant access: verified session identity remains authoritative, and the server must still check rights to the resource.

**Why:** Shared session cookies can change before a mounted tab receives Clerk, storage, or channel events. UI concealment and identity-scoped caches alone cannot prevent an old draft from being created under the new account. The user explicitly confirmed that these mechanisms operate at different, complementary layers, not as alternatives.

**How to apply:** Carry an immutable form-owner precondition on every private write, including creation, status changes, deletion, and reviewer forms. It is not an authentication credential: derive all persisted ownership from verified server authentication. Same-account session refreshes remain valid; missing or mismatched preconditions fail closed.

## Private read preconditions

Bind private reads to the tab's cache owner as well as binding writes to draft owners. Keep that precondition immutable through delayed dispatch and retries; never obtain it from a refreshed server profile.

**Why:** A successful identity check is only a point-in-time observation. Shared cookies can switch immediately afterward while a tab still owns its old cache, and cross-tab notifications can be missed. A fresh cache alone cannot stop new-account responses entering an old-account cache.

**How to apply:** Reject mismatched or missing initiating identities before any private persistence access, retain verified-session resource ownership checks, and disable HTTP caching for private reads. Do not make public/shared catalogs unnecessarily identity-specific.
