---
name: Orval parameter name collisions
description: Path and query validation can collide with generated Zod TypeScript exports
---

When adding both path parameters and inline query parameters to one operation, check the generated Zod barrel for duplicate parameter type names.

**Why:** The workspace's Orval configuration can emit the same operation-derived `Params` name for the path validator and query interface. Generation succeeds but the subsequent library declaration build fails with duplicate exports.

**How to apply:** Treat successful generation and successful declaration compilation as separate checks. Prefer an explicitly named request schema for structured mutation preconditions when that matches the HTTP operation, rather than manually editing generated exports.
