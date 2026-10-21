# Missed account notifications: two-tab browser regression

`missed-notifications.browser.mjs` exports an executable regression, not an
HTTP-only simulation. Run it in the Replit testing notebook with its Playwright
browser and `signInClerkUser` bridge. Read the testing skill, including its
Clerk and database-testing references. Both existing API and SBU web workflows
must be running. The shell does not provide standalone Playwright.

Load the module source into the notebook and evaluate it as follows (the
notebook can receive the source through its normal file-loading bridge):

```js
const run = new Function(
  source.replace("export async function", "return async function"),
)();
const observations = await run({
  browser,
  baseURL: `https://${REPLIT_DEV_DOMAIN}`,
  signInClerkUser,
  snapshotOwners,
  cleanupOwners,
});
```

## Required database adapters

`snapshotOwners(owners)` must return deterministically ordered JSON containing
all persisted rows for exactly the two supplied synthetic Clerk user IDs:

- `sbu_profiles` filtered by `user_id`, ordered by `user_id`;
- `sbu_cases` filtered by `owner_id`, ordered by `id`;
- `sbu_evidence` joined through those cases, ordered by evidence `id`;
- `sbu_workspaces` filtered by `owner_id`, ordered by `id`;
- `sbu_clients` joined through those workspaces, ordered by client `id`;
- `sbu_audit_logs` filtered by `user_id`, ordered by `id`.

Use parameterized development-database queries, not production. Include every
column (including timestamps) so an unexpected hidden write fails the
comparison. Keep the snapshot and identifiers in memory, never in saved reports.

`cleanupOwners(fixtures)` receives only this run's generated owners, initial
names, and synthetic emails. Verify each ID belongs to the matching generated
email before deleting its Clerk user using the server-side Clerk client (never
read or print secret values). Only those temporary users may be deleted. In a
database transaction remove their dependent documents, evidence, cases, audit
rows, clients, workspaces, and profiles in FK-safe order. Confirm zero matching
rows remain. Cleanup must tolerate a partial setup. Never reuse real accounts.
Profile names may have legitimately changed to the accepted draft marker.

The server-side adapter is already supplied:
`artifacts/api-server/test/helpers/cleanup-form-owner-browser-fixtures.mjs`.
Pass `JSON.stringify(fixtures)` through stdin to:

```sh
pnpm --filter @workspace/gustafta-sbu exec node --import tsx ../api-server/test/helpers/cleanup-form-owner-browser-fixtures.mjs --stdin
```

This process uses the existing server environment internally; no secret is
passed to the browser. It verifies exact synthetic emails, commits scoped
database cleanup on one pooled connection, deletes verified Clerk users, and
returns only counts/booleans. These fixtures never upload attachments; unexpected
document rows abort cleanup rather than orphaning stored bytes.

## What this isolates

Each of four scenarios uses exactly two pages in one browser context:
profile edit, case creation, evidence creation, and evidence edit.
Fixtures are created through real authenticated API calls; both the negative
submission and the positive B submission use real UI buttons and real APIs.

Tab A first mounts an A-owned draft. Its test-only init script then drops
storage/channel events and focus/visibility signals, pins the account-key read,
and freezes Clerk's JavaScript cookie view. It suppresses old SDK cookie writes
and disconnects **only A's Clerk refresh requests** while armed. These measures
keep the mounted SDK stale intentionally; this is not a test of SDK refresh,
Back/Forward, or BFCache. They do not freeze/change the browser cookie jar,
the SBU `fetch`, the request owner header, or the server.

Tab B's real Clerk sign-in redirect changes the shared cookie. B publishes both
notification types; A must count actual blocked deliveries of both. A's real
`GET /api/me` with an explicitly B-bound read header must now identify B while
A's sidebar and draft still identify A. Bootstrap takes the expected owner from
Clerk's signed-in session, waits for the shared cookie exchange, then verifies
that identity through the server's owner-bound `/api/me`. Decoded cookie claims
are a readiness signal only, not trusted authentication. Every helper API call
requires an explicit expected owner; the old form's own header remains A.
Only then is the old form submitted. The same document must remain loaded,
the header must still bind A, the response must be 409 with a visible reload
instruction, and a complete database snapshot for A and B must be unchanged.

Finally, a new B document must save through the same form type with a B-bound
header, show success in the UI, and expose the saved value through the real API.
An A-owned evidence ID returning 404 is **not** sufficient: the old draft must
be rejected by the owner precondition with 409 before resource access.

The optional `scenarios` array can select independently cleanable notebook runs;
omitting it still runs all four scenarios. Do not change or replace the runner
source in the notebook to select a scenario.

Save only the returned sanitized observations plus browser/version and runner
date in `run-report.json`. Do not save URLs containing sign-in tokens, cookie
values, Clerk IDs, emails, database snapshots, or temporary fixture IDs.

## Same-account session renewal (positive complement)

`same-account-session.browser.mjs` exports `runSameAccountSessionRegression`.
Load it with the same `new Function` recipe and pass the same callbacks. For
this runner, `snapshotOwners` must accept **one** distinct synthetic owner,
not the two-owner assertion in the older notebook recipe; keep all six snapshot
queries and their ordering unchanged. Use the existing scoped cleanup CLI
above, including an empty-fixture dependency-loading check before creating users.
Its exact email allowlist already supports all four scenarios in this runner.

For notebooks with a per-action execution limit, invoke the runner once per
scenario using `scenarios: ["profile"]` (then `case-create`, `evidence-create`,
`evidence-edit`), performing scoped cleanup after each action. Default execution
still includes all four. Supply `checkpointFixtures` to write the same private,
mode-0600 fixture handoff **before sign-in** and after recording the owner.
Unlike `cleanupOwners`, checkpointing only stages data; it must not delete it.
This preserves exact-email cleanup scope even if the notebook worker resets
before `finally` executes. Remove the handoff only after successful CLI cleanup.

Each scenario opens an A-owned draft, then signs the **same** synthetic user in
again in tab B. The real shared `__session` cookie must carry a different
session ID but the same user ID. A retains its document and draft while the
same notification/SDK fault injection is armed. A blocked storage event is
forced by removing and restoring the account key (setting the same value alone
would not emit an event); actual blocked storage and channel deliveries are
required. No SBU response, cookie jar, mutation header, or server is mocked.

The old profile/case/evidence-create/evidence-edit form must submit its original
A owner header without bearer authentication, receive exactly 200/201, show the
saved value without reloading A, and persist it in both a real API read and a
scoped database snapshot. Profile organization and evidence notes are also
checked. The shared jar must still hold the renewed session after saving.
This tests neither BFCache nor SDK refresh. It requires no application change.

Save only sanitized observations, browser/version, run date, and cleanup counts
in `same-account-session.run-report.json`. Session IDs/claims and fixture data
must remain in memory or the private temporary cleanup handoff, never reports.
