---
name: Cleanup timeout safety
description: Invariants needed when cleanup releases its lifecycle lock before a storage request settles.
---

Stopping the wait for App Storage is not cancellation of the provider operation. Preserve permanent ineligibility of cleanup targets: expired reservations must never become ready again, new reservations must never adopt orphan paths or IDs, and every cleanup deletion must remain generation-conditional.

**Why:** A provider can acknowledge or retry a DELETE after cleanup has stopped and released its transaction lock. Lock exclusion alone cannot protect a later attempt to revive that target. Ready documents must be excluded before issuing any deletion.

**How to apply:** Revisit this safety argument before extending upload completion windows, adding reservation revival/import/adoption, or changing storage deletion semantics. If targets can become eligible again, introduce a durable deletion fence or genuine provider cancellation before releasing the lock; do not merely increase the timeout.
