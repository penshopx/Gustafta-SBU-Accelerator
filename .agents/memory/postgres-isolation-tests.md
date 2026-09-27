---
name: PostgreSQL isolation tests
description: Testing live index enforcement without inserting into application tables
---

When testing database uniqueness without touching user data, check the live table's index definition first, then clone it with `LIKE ... INCLUDING ALL` in a disposable schema for concurrent writes. Do not assume the copied index retains its original name; PostgreSQL assigns it a different name. Cast catalog `name[]` projections to `text[]` when comparing arrays through node-postgres, which otherwise returns the array as a string for that type.

**Why:** A cloned table alone could pass even when the live index is missing, and asserting the original index name on a clone incorrectly fails despite correct uniqueness behavior.

**How to apply:** Use this approach for non-destructive PostgreSQL index integration checks; verify the live index from catalog metadata and assert SQLSTATE `23505` plus the duplicated key on the isolated clone.