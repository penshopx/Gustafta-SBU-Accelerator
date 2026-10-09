# Gustafta production BFCache acceptance runner

This is a replay recipe for the Replit `ExecutePlaywrightAction` notebook. The
workspace shell does not resolve a standalone Playwright package; use the
injected browser bridge and Clerk test helper. The recipe deliberately uses a
separately launched Chromium process without
`--disable-back-forward-cache`, two tabs in one context, native history
traversals, and no `page.route`, synthetic lifecycle events, or CDP Network
interception.

## 1. Serve the production bundle

Build the SBU app and temporarily serve its production output through the
managed web workflow:

```sh
PORT=26110 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/gustafta-sbu run build
```

For the test only, use `vite preview --config vite.config.ts --host 0.0.0.0`
as the SBU web workflow's `dev` command and restart
`artifacts/gustafta-sbu: web`. After the test, restore
`vite --config vite.config.ts --host 0.0.0.0` and restart the workflow.
Do not use a Vite development/HMR page as the BFCache target.

## 2. Launch Chromium and create the shared context

Run in the browser notebook, where `browser`, `REPLIT_DEV_DOMAIN`,
`signInClerkUser`, and `query` are injected:

```js
const browserRun = await browser.browserType().launch({
  headless: true,
  executablePath: "/repl/tools/bin/chromium",
  ignoreDefaultArgs: ["--disable-back-forward-cache"],
});
const ctxRun = await browserRun.newContext({
  baseURL: `https://${REPLIT_DEV_DOMAIN}`,
  timezoneId: "UTC",
});
const pageA = await ctxRun.newPage();
const pageB = await ctxRun.newPage();
```

Create fresh run-scoped synthetic emails, then establish A in page A:

```js
const suffix = nanoid();
const emailA = `bfcache-a-${suffix}@example.com`;
const emailB = `bfcache-b-${suffix}@example.com`;
const signInA = await signInClerkUser({
  firstName: "Cache", lastName: `Alpha ${suffix}`, email: emailA,
  basePath: "/api/me",
});
await pageA.goto(signInA);
const meA = await pageA.evaluate(async () => {
  const r = await fetch("/api/me", { cache: "no-store" });
  return { status: r.status, data: await r.json() };
});
if (meA.status !== 200) throw new Error("A /api/me did not succeed");
```

Complete ordinary A onboarding and create one private draft case in the UI.
Use a unique synthetic company name as the private marker. Record the case
route in memory; do not print user IDs, email addresses, or case identifiers
in evidence output. The case must be owned by A and visible in A's detail
route before proceeding.

Install an early lifecycle probe before loading the detail document. Pass the
unique marker string to the init script; save only event booleans and surface
visibility in `sessionStorage`:

```js
const privateMarker = `BFCache fixture ${suffix}`;
await ctxRun.addInitScript((marker) => {
  const key = "__gustafta_bfcache_evidence";
  const save = (type, event) => {
    const gate = [...document.querySelectorAll("#root div")]
      .find((el) => el.style.display === "contents" || el.style.display === "none");
    const record = {
      type, trusted: event?.isTrusted ?? null,
      persisted: event?.persisted ?? null,
      path: location.pathname,
      wrapperDisplay: gate?.style.display ?? null,
      privateMarkerPresent: document.body?.innerText.includes(marker) ?? false,
    };
    const records = JSON.parse(sessionStorage.getItem(key) || "[]");
    records.push(record);
    sessionStorage.setItem(key, JSON.stringify(records));
  };
  addEventListener("pagehide", (e) => save("pagehide", e), true);
  addEventListener("pageshow", (e) => {
    save("pageshow", e);
    if (e.persisted) requestAnimationFrame(() => save("first-rAF-after-persisted-pageshow"));
  }, true);
}, privateMarker);
```

## 3. A → B switch while A is frozen; native Back and Forward

Use full-document navigations to an external base and destination. Never mount
the Gustafta app in page B while A is frozen: its cross-tab BroadcastChannel
message can evict A from BFCache. The Clerk helper redirect to `/api/me`
changes the shared session without mounting that publisher.

```js
const appOrigin = `https://${REPLIT_DEV_DOMAIN}`;
await pageA.goto("https://example.com/");
await pageA.goto(`${appOrigin}/cases/${caseId}`); // A marker must be visible
await pageA.goto("https://example.org/");         // A is now frozen candidate

const signInB = await signInClerkUser({
  firstName: "Cache", lastName: `Beta ${suffix}`, email: emailB,
  basePath: "/api/me",
});
await pageB.goto(signInB);
const meB = await pageB.locator("body").innerText(); // verify B JSON, no app shell

await pageA.goBack(); // native Back; inspect persisted pageshow and first rAF
// Verify /api/me is freshly B-owned, and the A case is denied/not found.
await pageA.goBack(); // return to example.com base
await pageA.goForward(); // native Forward; verify persisted pageshow again
```

At each traversal, require `pageshow.isTrusted === true` and
`pageshow.persisted === true`; require `wrapperDisplay === "none"` and the A
marker absent both at `pageshow` and at its first recorded animation frame.
After the guard's full-document reload, check B's fresh `/api/me` result and
the A-owned case denial. A successful ordinary load (`persisted:false`) is
not BFCache proof.

## 4. Optional `/api/me` failure restore

To exercise the app's error surface without disrupting the static app reload,
use a temporary API-server-only fixture while the target app document is
frozen. A minimal fixture is an env-gated middleware after Clerk identity
verification and before the API router that returns `503` for
`GET /api/me` only when `GUSTAFTA_BFCACHE_TEST_FAIL_ME=1`. Restart the API
workflow with that env override after navigating A away; do not use browser
offline mode, `page.route`, or CDP Network interception for this assertion.

Perform the native restore and verify the app itself renders its
session-verification error for `GET /api/me · HTTP 503`, states that private
data remains closed, and never exposes the A marker. Remove the fixture and
env file and restart the API workflow without the override before finishing.

## 5. Dashboard summary ordering with held `/api/me`

For the A-owned `/dashboard` summary gap, use the same production bundle and
shared A/B context, but keep B's sibling tab API-only. Freeze A's summary with
a full-document navigation to the external base, switch B through the Clerk
helper redirect to `/api/me`, and restart `artifacts/api-server: API Server`
with `artifacts/gustafta-sbu/test/bfcache/dashboard-hold.env`. The exact
temporary override is `GUSTAFTA_BFCACHE_TEST_HOLD_ME=1`.

The env-gated middleware is placed after Clerk identity verification and
before `app.use("/api", router)`. It holds only `GET /api/me`, sets
`Cache-Control: private, no-store`, and has a 60-second server-side failsafe.
The API-only B page releases it with
`POST /api/__bfcache_test/release-me`; the JSON response reports the number
of released waiters. Do not use browser network interception.

After native Back, capture the pending state first: require a trusted persisted
`pageshow`, a hidden gate and absent A marker at that event and the first rAF,
Clerk B matching, a new `/api/me` request with no response yet, and no private
sidebar. In the immediate next notebook action, start the response waiter only
after capturing that state, release through B, await the fresh `/api/me` 200
and verify its B identity, then wait for the sidebar. This avoids the
frontend's session-check deadline expiring while the server holds the request.
Require the first dashboard shell record to show B's sidebar/Clerk identity,
the A marker absent, and a completed `/api/me` ResourceTiming entry.

Install a reset-on-each-document shell observer before loading the target.
Use a per-probe flag and pair a MutationObserver with a short polling fallback
so the first sidebar insertion is recorded:

```js
await ctxRun.addInitScript(({ marker, expectedBName, expectedBId }) => {
  const key = "__gustafta_dashboard_order";
  window.__bfShellLogged = false;
  const check = () => {
    const sidebar = document.querySelector('[data-testid="text-sidebar-name"]');
    if (!sidebar || window.__bfShellLogged) return;
    window.__bfShellLogged = true;
    const me = performance.getEntriesByType("resource")
      .filter((e) => new URL(e.name).pathname === "/api/me").at(-1);
    const records = JSON.parse(sessionStorage.getItem(key) || "[]");
    records.push({
      type: "first-dashboard-shell-visible",
      at: performance.now(),
      shellIsB: sidebar.textContent?.trim() === expectedBName,
      clerkIsB: window.Clerk?.user?.id === expectedBId,
      markerPresent: document.body?.innerText.includes(marker) ?? false,
      meStatus: me?.responseStatus ?? null,
      meResponseEnd: me?.responseEnd ?? null,
    });
    sessionStorage.setItem(key, JSON.stringify(records));
    clearInterval(poll);
  };
  new MutationObserver(check).observe(document, {
    childList: true, subtree: true, characterData: true,
  });
  const poll = setInterval(check, 25);
  setTimeout(() => clearInterval(poll), 30_000);
}, { marker: privateMarker, expectedBName, expectedBId });
```

Record booleans/status/timings only; never persist the Clerk ID, email,
cookie, or marker string. Remove the middleware and env file after the run and
restart the API workflow without an override.

## 6. Sanitized evidence and cleanup

Save only booleans, status codes, route paths, and wrapper visibility. Never
save Clerk IDs, emails, auth cookies, or secret values. Before cleanup, select
the exact run-scoped synthetic profiles and their dependent app rows; refuse
cleanup unless the expected profiles match exactly. Delete only those Clerk
users through the existing `@clerk/express`/`@clerk/backend` client using the
server's secret environment, then remove their documents, cases, profile,
workspace, client, and audit rows in a database transaction. Verify zero
matching profiles remain. Finally close the isolated browser context and
browser, remove any temporary API failure fixture, and restore the original
web workflow command.

The completed run's sanitized observation summary is in
[`attempt-report.json`](./attempt-report.json).
