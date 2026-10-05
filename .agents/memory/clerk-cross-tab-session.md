---
name: Clerk cross-tab session synchronization
description: Why a mounted Clerk user can disagree with the API owner after another tab changes sessions
---

Treat a tab's in-memory Clerk user and the cookie-backed API session as independently changing signals when accounts switch in another tab.

**Why:** A two-tab browser check found the old tab kept its mounted Clerk user and private detail after the shared session cookie changed. A test handshake also briefly selected a new client user while the API still identified the former owner; this was a session mismatch, not an authorization query that ignored ownership.

**How to apply:** On cross-tab identity changes, hide private views before refreshing the stale tab. Before rendering data, compare the server-reported owner with the current Clerk user. When testing ownership, verify both identities agree before concluding an API returned another person's data.

Do not use matching local storage as proof that a back-forward-cache restoration still owns its old session. Conceal private DOM before the browser saves the page, then obtain a fresh Clerk identity and server owner before reopening it.

**Why:** Frozen documents can miss cross-tab notifications, and storage can be unavailable or still contain the old identity. Checking only after restoration can expose the previously saved frame.

**How to apply:** Keep restored documents closed while reloading authentication and private query state, including same-account restoration and network failures.