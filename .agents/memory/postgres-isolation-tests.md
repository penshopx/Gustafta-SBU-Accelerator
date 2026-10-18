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

Bootstrap the disposable schema and tables before creating a restricted route login; the restricted harness grants access to existing objects, not permission to create the fixture. Make cleanup steps independent and preserve the primary test failure when teardown also fails.

**Why:** Granting against a missing schema can fail mid-setup and leave an orphan login. A teardown error can hide the first failure and leave pools open, obscuring the cause until the runner times out.

**How to apply:** In isolated route tests, set up schema and fixture data with the administrator connection, then mount the restricted connection for route calls only. Release each resource even if another release fails; report teardown failures separately from the original assertion.

Route-test database shims should expose the schema-only exports while continuing to replace the database connection. Do not import the application's database bootstrap merely to satisfy newly mounted subrouters.

**Why:** Bundling a parent router resolves model imports from all mounted subrouters, even when the test never calls those endpoints. Importing the real database bootstrap to fix missing exports risks defeating connection isolation.

**How to apply:** Re-export schema definitions from the schema-only barrel; inject only the restricted fixture connection as the runtime database.