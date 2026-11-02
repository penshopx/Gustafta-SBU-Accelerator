---
name: Browser network filtering
description: Keep test traffic controls from blocking application modules or Clerk initialization.
---

Match telemetry destinations and request types, not the word analytics anywhere in a URL. Keep authentication initialization separate from application mutations when restricting non-read requests.

**Why:** A browser test's broad analytics matcher blocked a first-party Vite module import and prevented application mounting. An additional blanket POST restriction blocked Clerk's anonymous development-browser initialization, producing a misleading session timeout.

**How to apply:** Record sanitized failed resource paths, methods and resource types before diagnosing a blank page as an application bug. Permit required authentication protocol traffic while blocking actual application mutations and paid-provider calls. Anonymous Clerk initialization is not proof of authenticated login.

For authenticated API comparisons, prefer same-origin browser fetch with
`credentials: "include"` and the verified immutable owner header, or a request
client sharing the complete browser-context cookie jar.

**Why:** Forwarding only the intercepted request's cookie header produced
test-side 401 responses despite a valid browser session. Same-origin requests
successfully exercised the unchanged authentication boundary.

**How to apply:** Confirm an authenticated identity read succeeds before
seeding data. Never print cookies or tokens, fake authenticated responses, or
relax application authentication to repair the test transport.
