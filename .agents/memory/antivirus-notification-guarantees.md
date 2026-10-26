---
name: Antivirus notification guarantees
description: Shared cooldown persistence and notification delivery durability are separate guarantees.
---

Treat shared incident suppression and successful notification delivery as separate guarantees.

**Why:** Cross-instance/restart deduplication was requested while retaining bounded asynchronous Slack/HTTPS delivery. Claiming shared cooldown before enqueue prevents competing instances from sending the same observation, but a crash between that claim and delivery can lose the notice. Holding a database transaction open across network delivery would not resolve ambiguous remote acceptance.

**How to apply:** Do not describe shared cooldown as exactly-once or restart-safe delivery. Stronger delivery guarantees require a durable outbox and remote idempotency strategy, not a process-local fallback that reintroduces duplicate incident alerts. Persist only operational state, never document or user data.
