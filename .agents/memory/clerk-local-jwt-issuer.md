---
name: Clerk local JWT issuer checks
description: Why offline Clerk session verification needs an explicit issuer boundary
---

When accepting Clerk session JWTs with a local verification key, compare the verified session's issuer to the frontend API of the publishable key selected for the request. Do this before reading private data.

**Why:** A valid signature and unexpired lifetime alone did not reject a session claim naming another issuer in the installed Clerk middleware. A synthetic, locally signed token proved this without contacting Clerk.

**How to apply:** Keep the comparison tied to the same request-specific publishable key used by Clerk middleware, including custom-domain resolution. Exercise both bearer and cookie transports with offline synthetic keys.