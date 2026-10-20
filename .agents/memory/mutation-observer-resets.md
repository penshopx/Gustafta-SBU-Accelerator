---
name: Mutation observer resets
description: Separate server-result refresh from dialog-specific mutation completion effects.
---

Keep cache refresh for successful writes in mutation-level callbacks, not solely in callbacks passed to mutate. Treat dialog closing as a separate effect scoped to the originating confirmation instance.

**Why:** React Query observer reset or a subsequent mutate can detach the previous per-call callbacks without cancelling its request. A successful write can otherwise leave the list stale when the user opens another confirmation.

**How to apply:** When a dialog can close during a request, test completion after it is replaced, both before and after the replacement submits. Check data refresh independently of which dialog remains open. Use an instance identity rather than only a record ID when a confirmation can reopen for the same record.
