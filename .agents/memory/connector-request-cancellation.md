---
name: Connector request cancellation
description: SDK convenience proxy calls and abort-aware fetch adapters have different cancellation behavior.
---

Do not assume every connectors SDK entry point forwards Fetch cancellation
and redirect options. Inspect the installed SDK when those controls are needed.

**Why:** The convenience `proxy` method accepted only method, body, and headers,
while `createProxyFetch` preserved Fetch `signal` and `redirect` options.
A caller-side timeout alone can leave a write running and retry it after it
has already succeeded.

**How to apply:** For bounded operational notifications, prefer an SDK fetch
adapter that actually forwards abort and redirect policy, retain a deadline
around the whole operation, and document ambiguous outcomes/possible duplicate
delivery. Recheck the installed SDK before applying this to a later release.
