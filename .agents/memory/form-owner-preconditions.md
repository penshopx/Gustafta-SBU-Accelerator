---
name: Form owner preconditions
description: Preventing old drafts from being written through a different account's shared cookie
---

Bind a mutation to the authenticated account that opened its draft, and reject a different cookie-backed owner on the server before accessing persistence. Never refresh the draft's owner when dispatching or retrying.

**Why:** Shared session cookies can change before a mounted tab receives Clerk, storage, or channel events. UI concealment and identity-scoped caches alone cannot prevent an old draft from being created under the new account.

**How to apply:** Carry an immutable form-owner precondition on every private write, including creation, status changes, deletion, and reviewer forms. It is not an authentication credential: derive all persisted ownership from verified server authentication. Same-account session refreshes remain valid; missing or mismatched preconditions fail closed.
