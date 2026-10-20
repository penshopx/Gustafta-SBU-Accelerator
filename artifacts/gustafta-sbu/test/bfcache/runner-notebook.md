# Isolated Chromium BFCache runner

The notebook recipe has been replaced by an executable runner:

```sh
pnpm --filter @workspace/gustafta-sbu test:bfcache
pnpm --filter @workspace/gustafta-sbu test:bfcache:unit
```

Run from this workspace with its existing **test** `CLERK_SECRET_KEY` and
`VITE_CLERK_PUBLISHABLE_KEY` supplied by the environment. The runner refuses live
keys. Never copy credentials into command arguments, source files or reports.
Dependencies are declared in this app's development dependencies.

By default Chromium is launched from `/repl/tools/bin/chromium`; elsewhere set
`BFCACHE_CHROMIUM_PATH` to an installed full Chromium executable. This must not be
the BFCache-disabled browser from a pre-existing notebook. No browser-engine or
user-agent substitutions count as evidence.

## What runs

`run.mjs` builds the unchanged app with Vite's production build into a unique OS
temporary directory. Only build-time routing is set to `/`, with Clerk's test
frontend API used directly (no development proxy needed). It does **not** change
the managed frontend or API command, their ports, environment, or `dist` output.
The normal application and API do not import any code in this test directory.

`fixture-server.mjs` listens on a random loopback port and serves that bundle.
Real Clerk test sessions authenticate requests, but profiles, one A-owned case,
dashboard data, and `/api/me` hold/failure controls exist only in memory in this
test server. There are no database writes, uploaded files or application audit
rows to clean up. No test middleware or release endpoint is added to the normal
server. The test server is read-only and rejects unknown fixture API routes.

The server deliberately serves static documents with `no-cache`, not `no-store`:
Chromium can evict a `no-store` document when session cookies change. Private API
responses remain `private, no-store`. No request interception or offline mode is
used. Native Back/Forward must produce trusted `pageshow.persisted=true`; a
reload, missing first restored animation frame, visible A data, or unproven
response ordering makes the process exit nonzero.

During restoration the test server delays the ordinary HTML reload by 150 ms.
This ensures a real first restored animation frame is observable on loopback
before the guard's reload replaces the document. No app script is delayed or
modified; only test HTTP latency is added.

Each scenario uses a fresh browser context with two tabs. B's real Clerk session
is prepared **before** freezing A; its cookies stay only in memory and its SDK
document is navigated away. A's dashboard or case
detail is loaded from the production bundle and its unique synthetic case marker
must actually be visible before freezing. While A is frozen, B's preauthenticated
cookie jar replaces the shared cookies only inside this isolated context. The
sibling confirms B through `/api/me`, without loading either the app or the
Clerk SDK. Even Clerk's own BroadcastChannel can evict a frozen document, so
simply avoiding the Gustafta publisher is insufficient. This intentionally
models a silent session switch missed by the frozen page, not ordinary UI login.

Dashboard and case detail are exercised with both Back and Forward. For each,
the fresh B `/api/me` response is held until the runner has recorded the hidden
pending state, then released in-process (not through a public endpoint). A
separate dashboard restore returns `/api/me` 503 and requires the verification
error surface to remain closed. The case route must deny A's case under B.

## Evidence

`probe.mjs` installs a lifecycle probe before any app script, and a
MutationObserver plus animation-frame observer before private content can mount.
It records:

- Native `pageshow` trust/persistence and gate visibility.
- Visibility on the first animation frame following the persisted event.
- Any transient A marker or non-B sidebar exposure after arming.
- The **first** visible B shell, Clerk-B agreement, `/api/me` response status and
  ResourceTiming response end on the new document.
- Test-server request start/response times and B ownership as a boolean.

The target is foregrounded before history traversal; headless background tabs
also suspend animation frames. Browser-reported non-restoration reason codes
are included without frame URLs, for diagnosing missing BFCache evidence.

All browser timestamps use `performance.timeOrigin + performance.now()` (or
`timeOrigin + responseEnd`) so restores and reloads share one time scale.
Server timestamps use epoch milliseconds. The ordering assertion uses browser
timestamps within the same clock, not a comparison against a different host.

The sanitized JSON is written automatically to a unique
`generated-artifacts/bfcache/run-<random>/report.json` in the workspace root,
including failed runs. The console prints the exact path for that execution.
The random directory name is unrelated to account IDs, emails or the synthetic
account suffix. Each report is published complete, with file permissions `0600`.

`generated-artifacts/bfcache/latest.json` contains only a relative pointer, for
example `{"report":"run-AbCd12/report.json"}`. It is replaced by an atomic rename
**after** the report is complete. Concurrent runs keep all their reports; latest
means the last pointer publication, not the last start or the last successful
privacy check. Read the pointer once, then open its referenced file:

```sh
node --input-type=module -e '
  import { readFile } from "node:fs/promises";
  import { join } from "node:path";
  const root = "generated-artifacts/bfcache";
  const { report } = JSON.parse(await readFile(join(root, "latest.json"), "utf8"));
  console.log(join(root, report));
  console.log(await readFile(join(root, report), "utf8"));
'
find generated-artifacts/bfcache -mindepth 2 -maxdepth 2 -name report.json -print
```

An old top-level `report.json`, if present from an earlier runner version, is
historical only and is no longer updated. If publishing fails, the command fails;
the previous latest pointer remains usable and any completed run report remains
discoverable with `find`. An interrupted run may leave an empty run directory or
temporary file; neither is completed evidence. Atomic publication protects
concurrent readers, not durability against a host/power failure.

`test:bfcache:unit` includes two synchronized, independent report writers and a
reader checking pointer/report consistency. It uses only synthetic report data,
without importing the runner, launching Chromium or creating Clerk accounts.

This directory is excluded from Git and deployment. Reports contain fixed scenario/route labels,
booleans, timings, status codes and safe failure codes, **not** Clerk IDs, emails,
cookies, tickets, secret values, raw exceptions, request headers or case markers.
No HAR, browser trace, screenshot or storage-state dump is saved.

`attempt-report.json` remains the historical manually run Chromium evidence;
it is not rewritten to imply that its missing timestamp was measured.
`cross-engine-report.json` describes the separate Firefox/WebKit availability
gap. This runner proves Chromium only, not Firefox, WebKit or native Safari,
and its fixture API is not a substitute for live API authorization tests.

## Cleanup and failures

Browser, HTTP server, temporary build and exact run-created Clerk users are
cleaned up in `finally`, including failed assertions. Before deleting any user,
the runner verifies its exact generated email and unique run suffix, then
confirms Clerk returns 404 after deletion. Cleanup
failures are separate from the primary failure and also make the run fail.
Do not use force-kill if you want JavaScript cleanup to run.

Failure reports identify the scenario and stage; provider exceptions are reduced
to numeric HTTP status and allowlisted error codes. Fix missing browser,
test keys, network access or fixture contracts and rerun the command. A failed
or unavailable browser never becomes a privacy pass.
