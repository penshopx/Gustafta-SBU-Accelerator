---
name: Async fixture imports
description: Avoiding top-level-await cycles in bundled subprocess fixtures.
---

An asynchronously initialized fixture module must not itself await a dynamic import of consumers that import that fixture. Use a separate entry point to initialize the fixture, then load its consumers.

**Why:** In an esbuild-bundled subprocess, this dependency cycle stalled initialization and Node exited with an unsettled top-level-await warning, before the fixture server could start. Waiting longer or keeping IPC open does not resolve the dependency cycle.

**How to apply:** For subprocess tests with IPC-provided configuration, keep configuration and shared runtime exports in one module and server startup in another entry point. Consumers can then import the already-initialized fixture without awaiting their own initialization.
