---
name: Clerk cross-tab session synchronization
description: Why a mounted Clerk user can disagree with the API owner after another tab changes sessions
---

Treat a tab's in-memory Clerk user and the cookie-backed API session as independently changing signals when accounts switch in another tab.

**Why:** A two-tab browser check found the old tab kept its mounted Clerk user and private detail after the shared session cookie changed. A test handshake also briefly selected a new client user while the API still identified the former owner; this was a session mismatch, not an authorization query that ignored ownership.

**How to apply:** On cross-tab identity changes, hide private views before refreshing the stale tab. Before rendering data, compare the server-reported owner with the current Clerk user. When testing ownership, verify both identities agree before concluding an API returned another person's data.