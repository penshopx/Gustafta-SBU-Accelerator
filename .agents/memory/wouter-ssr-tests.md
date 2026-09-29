---
name: Wouter server-rendered tests
description: Router setup for static component render tests in Node without browser globals
---

For static server-rendered component tests that contain Wouter links, provide the Router with a fixed location hook instead of the browser hook or the memory-location hook.

**Why:** The browser hook accesses `location` in Node, while the memory-location hook lacks the server snapshot required by React's server renderer.

**How to apply:** Use a custom hook returning a typed mutable tuple of the current path and a no-op navigation function when the test only inspects HTML. Use a browser-capable test setup if navigation itself must be exercised.