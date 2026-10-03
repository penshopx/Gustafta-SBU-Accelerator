---
name: HTTP Host test transport
description: Preserve explicit public Host headers in local authentication tests
---

Use Node's HTTP request client when a local integration test needs to send a public `Host` header while connecting to loopback.

**Why:** The workspace's Node fetch replaced an explicitly supplied `Host` header with the loopback URL's hostname. This made correct host-based Clerk authentication appear to fail, while forwarded-host scenarios passed.

**How to apply:** Keep the network destination on loopback and supply the public hostname as an HTTP header. Continue blocking unexpected Clerk API/JWKS requests when using synthetic local JWT keys.