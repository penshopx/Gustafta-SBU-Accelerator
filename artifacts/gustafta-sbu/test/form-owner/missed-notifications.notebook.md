# Missed-notifications real-browser notebook recipe

This recipe evaluates `missed-notifications.browser.mjs` without rewriting its
behavior (apart from the export wrapper below).
Both API and SBU web workflows must be running. Use only synthetic accounts
created by `signInClerkUser`, and do not save credentials, Clerk IDs, emails,
cookies, or database snapshots in reports.

## Notebook setup and database snapshot

Read the runner source using the notebook file bridge, then evaluate the
exported function as documented in `README.md`:

```js
const source = await fs.promises.readFile(
  "artifacts/gustafta-sbu/test/form-owner/missed-notifications.browser.mjs",
  "utf8",
);
const run = new Function(
  source.replace("export async function", "return async function"),
)();
```

Use the injected parameterized development `query` bridge for the required
complete snapshot. `SELECT *` preserves every current column, including
timestamps. Each result is explicitly ordered; evidence and clients are joined
through the specified owned cases/workspaces.

The profile-positive assertion in the current runner waits for the updated B
sidebar and input value, then checks `/api/me` for persistence. It intentionally
does not require the transient `Profil berhasil disimpan.` status: the
`SettingsPage` key includes saved profile values, so a successful profile
update remounts `ProfileForm` and clears its mutation `isSuccess` state. Record
that missing confirmation separately; do not change application code for this
regression.

```js
const snapshotOwners = async (owners) => {
  const ids = [...new Set(owners)];
  if (ids.length !== 2 || owners.length !== 2) {
    throw new Error("Expected exactly two distinct supplied owners");
  }
  const rows = async (sql) => (await query(sql, [ids])).rows;
  return {
    profiles: await rows(
      "SELECT * FROM sbu_profiles WHERE user_id=ANY($1::text[]) ORDER BY user_id",
    ),
    cases: await rows(
      "SELECT * FROM sbu_cases WHERE owner_id=ANY($1::text[]) ORDER BY id",
    ),
    evidence: await rows(
      "SELECT e.* FROM sbu_evidence e JOIN sbu_cases c ON c.id=e.case_id " +
      "WHERE c.owner_id=ANY($1::text[]) ORDER BY e.id",
    ),
    workspaces: await rows(
      "SELECT * FROM sbu_workspaces WHERE owner_id=ANY($1::text[]) ORDER BY id",
    ),
    clients: await rows(
      "SELECT cl.* FROM sbu_clients cl JOIN sbu_workspaces w ON w.id=cl.org_id " +
      "WHERE w.owner_id=ANY($1::text[]) ORDER BY cl.id",
    ),
    auditLogs: await rows(
      "SELECT * FROM sbu_audit_logs WHERE user_id=ANY($1::text[]) ORDER BY id",
    ),
  };
};
```

## Scoped Clerk/database cleanup bridge

The notebook does not expose the server-side Clerk client. Use the supplied
server-side CLI
`artifacts/api-server/test/helpers/cleanup-form-owner-browser-fixtures.mjs`.
Its email lookup deliberately avoids zipping owners to emails: the runner
appends owners B then A but stores emails A then B. The CLI verifies exact
synthetic email patterns and every supplied owner ID, handles a partially
recorded sign-in, refuses unexpected document attachments, deletes dependent
rows in its own FK-safe database transaction, then deletes only verified
synthetic Clerk users. It prints sanitized counts only.

Before creating users, run the CLI below once with `[]` on stdin to verify that
the adapter loads. This is not proof of Clerk delete permissions.

Use one scenario per notebook action: `profile`, `case-create`,
`evidence-create`, then `evidence-edit`. Do not loop over all four in a single
action or rewrite the runner source. The runner still defaults to all four for
environments without an action limit.

In a **separate setup action**, create the private directory and record its path
outside the notebook worker before starting the runner. Otherwise a reset can
lose the location as well as the in-memory fixture list. Use a fresh directory
for every scenario, only after the preceding cleanup has succeeded.

```js
const fixtureDir = await fs.promises.mkdtemp("/tmp/gustafta-form-owner-");
await fs.promises.chmod(fixtureDir, 0o700);
const fixtureFile = `${fixtureDir}/fixtures.json`;
console.log({ fixtureFile }); // path only; retain it outside worker memory
```

Install this adapter before the runner action. Atomic replacement retains the
previous valid payload if an update is interrupted. The checkpoint is awaited
before the first sign-in and after recording B and A. Both exact emails are
already present even if neither owner ID was recorded. Staging never deletes
anything; `cleanupOwners` is only the final refresh of the same handoff.

```js
const checkpointFixtures = async (fixtures) => {
  const pendingFile = `${fixtureFile}.pending`;
  // An interrupted update must be investigated/cleaned before another run.
  await fs.promises.writeFile(pendingFile, JSON.stringify(fixtures), {
    mode: 0o600, flag: "wx",
  });
  await fs.promises.rename(pendingFile, fixtureFile);
};
const cleanupOwners = checkpointFixtures;
```

Run exactly one selected scenario in the next action:

```js
let observations, primaryError;
try {
  observations = await run({
    browser, baseURL: `https://${REPLIT_DEV_DOMAIN}`, signInClerkUser,
    snapshotOwners, cleanupOwners, checkpointFixtures,
    scenarios: ["profile"], // next independent actions select the other scenarios
  });
} catch (error) {
  primaryError = error; // keep in memory; sanitize before reporting
}
console.log(JSON.stringify({
  observations,
  primaryError: primaryError && {
    name: primaryError.name,
    message: sanitize(primaryError.message),
  },
  fixtureFile, // path only; never log fixture contents
}));
```

Then run from the workspace root:

```sh
# Set FIXTURE_FILE to the exact path retained from the setup action.
pnpm --filter @workspace/gustafta-sbu exec node --import tsx \
  ../api-server/test/helpers/cleanup-form-owner-browser-fixtures.mjs \
  --stdin < "$FIXTURE_FILE"
status=$?
if [ "$status" -eq 0 ]; then
  rm -f -- "$FIXTURE_FILE" "$FIXTURE_FILE.pending"
  rmdir -- "$(dirname -- "$FIXTURE_FILE")"
fi
exit "$status"
```

If a worker resets, invoke this same command with the previously recorded path
without waiting for `finally` or starting another run. Keep the payload on CLI
failure and retry only after investigating the failure. Do not infer success
from a staging callback returning: only the CLI performs cleanup. Never use
`--remove-test-documents` for these scenarios or broaden the email allowlist.
If only a `.pending` file exists (first write interrupted), validate its JSON
before passing that exact file to the scoped CLI; keep it if parsing or cleanup
fails. Do not overwrite the last valid checkpoint with a truncated pending file.

Record only the CLI's sanitized cleanup counts. If the runner fails, clean its
staged fixtures immediately, record the exact sanitized primary failure, and
resume only the affected scenario and scenarios not yet run. Save rejection
screenshots without secret IDs and persist sanitized observations, browser
version, runner date, and cleanup counts in `run-report.json`.
Keep the primary runner error even if context closing, final staging, or CLI
cleanup also fails; report those cleanup failures separately, not instead.
