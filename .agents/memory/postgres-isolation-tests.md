---
name: PostgreSQL isolation tests
description: Testing live index enforcement without inserting into application tables
---

When testing database uniqueness without touching user data, check the live table's index definition first, then clone it with `LIKE ... INCLUDING ALL` in a disposable schema for concurrent writes. Do not assume the copied index retains its original name; PostgreSQL assigns it a different name. Cast catalog `name[]` projections to `text[]` when comparing arrays through node-postgres, which otherwise returns the array as a string for that type.

When cloned tables contain serial columns, replace copied serial defaults with clone-local identity generation before inserting without explicit IDs.

**Why:** A cloned table alone could pass even when the live index is missing, and asserting the original index name on a clone incorrectly fails despite correct uniqueness behavior. Copied serial defaults can still advance a sequence belonging to the original application table, even when rows are written only to the clone.

**How to apply:** Use this approach for non-destructive PostgreSQL integration checks; verify live indexes from catalog metadata when testing uniqueness, assert SQLSTATE `23505` plus the duplicated key on the isolated clone, and ensure insert-generated IDs use clone-local sequences.

For route integration tests, authenticate with a disposable restricted login instead of using an administrator connection with `SET ROLE`. Keep administrator access only for setup, catalog assertions, and cleanup. Fail explicitly when role creation, grants, login, or inherited permission checks cannot establish isolation; never fall back to the application account.

**Why:** `search_path` does not block explicitly qualified application writes, and `RESET ROLE` on an administrator session can restore its original privileges. A separate login keeps the original session identity restricted as well.

**How to apply:** Grant writes only on cloned tables and their local sequences, check inherited/PUBLIC write privileges before mounting routes, and use `EXPLAIN` without `ANALYZE` for denied-write probes so a permission regression cannot execute statement-level triggers on application tables.