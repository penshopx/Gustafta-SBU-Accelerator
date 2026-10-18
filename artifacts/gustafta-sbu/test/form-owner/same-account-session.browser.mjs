/**
 * Real two-tab browser regression; no mocked SBU requests or owner headers.
 * See README.md for the testing-notebook and scoped cleanup adapters.
 */
export async function runSameAccountSessionRegression({
  browser, baseURL, signInClerkUser, snapshotOwners, cleanupOwners,
  scenarios = ["profile", "case-create", "evidence-create", "evidence-edit"],
  checkpointFixtures = async () => {},
}) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  check(typeof snapshotOwners === "function", "A database snapshot callback is required");
  check(typeof cleanupOwners === "function", "A scoped cleanup callback is required");
  check(typeof checkpointFixtures === "function", "Invalid fixture checkpoint callback");
  const supported = ["profile", "case-create", "evidence-create", "evidence-edit"];
  check(Array.isArray(scenarios) && scenarios.length > 0
    && new Set(scenarios).size === scenarios.length
    && scenarios.every(scenario => supported.includes(scenario)), "Invalid scenario selection");
  const fixtures = [];
  const report = [];
  let primaryError;
  const api = async (page, owner, path, method = "GET", data) => {
    const result = await page.evaluate(async ({ owner, path, method, data }) => {
      const response = await fetch(path, {
        method, credentials: "same-origin", cache: "no-store",
        headers: {
          "X-SBU-Form-Owner": owner,
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }, { owner, path, method, data });
    check(result.status >= 200 && result.status < 300, `${method} ${path} failed (${result.status})`);
    return result.data;
  };
  // Inspect the actual browser jar, never A's intentionally stale document.cookie.
  // Keep all cookie values and claims in memory, outside sanitized reports.
  const session = async (context, previousId) => {
    // Navigation may finish before Clerk exchanges the sign-in ticket. During
    // renewal an existing cookie is not sufficient: wait for a different sid.
    const deadline = Date.now() + 30_000;
    do {
      const cookie = (await context.cookies(baseURL)).find(cookie => cookie.name === "__session" && cookie.value);
      if (cookie) {
        const claims = JSON.parse(atob(cookie.value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        check(claims.sid && claims.sub, "Session cookie omitted identity/session claims");
        if (claims.sid !== previousId) return { id: claims.sid, owner: claims.sub };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    throw new Error(previousId ? "Timed out waiting for a new Clerk session" : "Timed out waiting for a real Clerk session cookie");
  };
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({ baseURL });
      try {
        const tabA = await context.newPage();
        const tabB = await context.newPage();
        // Same fault injection as missed-notifications.browser.mjs, only in A.
        await tabA.addInitScript(() => {
          const state = {
            armed: false, storage: 0, channel: 0, focus: 0, visibility: 0,
            documentToken: Math.random().toString(36), owner: null, cookie: "",
          };
          window.__missedAccountNotifications = state;
          for (const type of ["storage", "focus", "visibilitychange"]) {
            const target = type === "visibilitychange" ? document : window;
            target.addEventListener(type, event => {
              if (!state.armed) return;
              state[type === "visibilitychange" ? "visibility" : type]++;
              event.stopImmediatePropagation();
            }, true);
          }
          const NativeChannel = window.BroadcastChannel;
          window.BroadcastChannel = class extends NativeChannel {
            constructor(name) {
              super(name);
              super.addEventListener("message", event => {
                if (!state.armed) return;
                state.channel++;
                event.stopImmediatePropagation();
              });
            }
          };
          const getItem = Storage.prototype.getItem;
          Storage.prototype.getItem = function (key) {
            if (state.armed && this === localStorage && key === "gustafta:active-account") return state.owner;
            return getItem.call(this, key);
          };
          const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
          Object.defineProperty(document, "cookie", {
            configurable: true,
            get() { return state.armed ? state.cookie : descriptor.get.call(document); },
            set(value) { if (!state.armed) descriptor.set.call(document, value); },
          });
        });
        let armed = false;
        await tabA.route("**/*", async route => {
          const url = new URL(route.request().url());
          const clerkRequest = url.hostname.endsWith(".clerk.accounts.dev")
            || url.hostname.endsWith(".clerk.com") || url.pathname.startsWith("/api/__clerk/");
          if (armed && clerkRequest) await route.abort("blockedbyclient");
          else await route.continue();
        });
        const suffix = `${Date.now()}-${scenario}-${Math.random().toString(36).slice(2, 8)}`;
        const person = {
          firstName: "Draft", lastName: "Alpha",
          email: `draft-a-${suffix}@example.com`, basePath: "/",
        };
        const name = `Fixture Alpha ${suffix}`;
        const value = `Retained draft ${suffix}`;
        const note = "Synthetic declaration, not verified evidence";
        const fixture = { owners: [], names: [name], emails: [person.email] };
        fixtures.push(fixture);
        // Persist the exact synthetic email BEFORE sign-in, so a notebook reset
        // cannot lose cleanup scope. This callback must stage privately, not delete.
        await checkpointFixtures(fixtures);
        await tabB.goto(await signInClerkUser(person));
        const original = await session(context);
        const owner = original.owner;
        fixture.owners.push(owner);
        await checkpointFixtures(fixtures);
        check((await api(tabB, owner, "/api/me")).userId === owner, "Initial session is not A");
        await api(tabB, owner, "/api/me", "PATCH", {
          displayName: name, organizationName: "Synthetic regression fixture", role: "kontraktor",
        });
        const caseRow = await api(tabB, owner, "/api/cases", "POST", {
          companyName: `Alpha case ${suffix}`, classification: "BG001",
          requestType: "baru", qualification: "kecil",
        });
        const evidence = await api(tabB, owner, `/api/cases/${caseRow.id}/evidence`, "POST", {
          code: "legalitas", title: `Alpha original ${suffix}`, note: "Original A note",
        });
        const pagePath = scenario === "profile" ? "/settings"
          : scenario === "case-create" ? "/cases" : `/cases/${caseRow.id}`;
        await tabA.goto(pagePath);
        await tabA.getByTestId("text-sidebar-name").waitFor();
        check(await tabA.getByTestId("text-sidebar-name").innerText() === name, "Draft did not mount as A");
        if (scenario === "profile") {
          await tabA.getByTestId("input-display-name").fill(value);
          await tabA.getByTestId("input-organization").fill(value);
        } else if (scenario === "case-create") {
          await tabA.getByTestId("button-create-case").click();
          await tabA.getByTestId("input-company-name").fill(value);
          await tabA.getByTestId("input-classification").fill("BG001");
        } else {
          await tabA.getByTestId(scenario === "evidence-edit"
            ? `button-edit-evidence-${evidence.id}` : "button-add-evidence").click();
          if (scenario === "evidence-create") {
            await tabA.getByTestId("select-evidence-code").selectOption("keuangan");
          }
          await tabA.getByTestId("input-evidence-title").fill(value);
          await tabA.getByTestId("input-evidence-note").fill(note);
        }
        const documentToken = await tabA.evaluate(owner => {
          const state = window.__missedAccountNotifications;
          state.owner = owner; state.cookie = document.cookie; state.armed = true;
          return state.documentToken;
        }, owner);
        armed = true;
        const before = await snapshotOwners([owner]);
        // A fresh sign-in for the SAME synthetic identity, in the shared jar.
        await tabB.goto(await signInClerkUser(person));
        const renewed = await session(context, original.id);
        check(renewed.owner === owner, "Renewal changed the account");
        check(renewed.id !== original.id, "Sign-in reused the old session; renewal was not exercised");
        check((await api(tabB, owner, "/api/me")).userId === owner, "Renewed server identity is not A");
        await tabB.evaluate(owner => {
          // Storage events require a value change, even for this same-account test.
          localStorage.removeItem("gustafta:active-account");
          localStorage.setItem("gustafta:active-account", owner);
          const channel = new BroadcastChannel("gustafta:active-account");
          channel.postMessage(owner);
          setTimeout(() => channel.close(), 100);
        }, owner);
        await tabA.waitForFunction(() => {
          const state = window.__missedAccountNotifications;
          return state.storage > 0 && state.channel > 0;
        });
        check((await api(tabA, owner, "/api/me")).userId === owner, "A's network identity changed");
        check(await tabA.getByTestId("text-sidebar-name").innerText() === name, "Mounted identity changed");
        const field = scenario === "profile" ? "input-display-name"
          : scenario === "case-create" ? "input-company-name" : "input-evidence-title";
        check(await tabA.getByTestId(field).inputValue() === value, "Renewal replaced the draft");
        const path = scenario === "profile" ? "/api/me" : scenario === "case-create" ? "/api/cases"
          : `/api/cases/${caseRow.id}/evidence${scenario === "evidence-edit" ? `/${evidence.id}` : ""}`;
        const method = scenario === "profile" || scenario === "evidence-edit" ? "PATCH" : "POST";
        const button = scenario === "profile" ? "button-save-profile"
          : scenario === "case-create" ? "button-save-case" : "button-save-evidence";
        const pending = tabA.waitForResponse(response =>
          new URL(response.url()).pathname === path && response.request().method() === method);
        await tabA.getByTestId(button).click();
        const saved = await pending;
        check(saved.status() === (method === "POST" ? 201 : 200), `${scenario}: renewed A draft was rejected`);
        check(saved.request().headers()["x-sbu-form-owner"] === owner, "Old draft owner header is not A");
        check(!saved.request().headers().authorization, "Mutation unexpectedly used bearer authentication");
        check((await session(context)).id === renewed.id, "Shared cookie reverted to the old session");
        const body = await saved.json();
        check((body.displayName ?? body.companyName ?? body.title) === value, "Write response lost draft value");
        if (scenario === "profile") {
          await tabA.waitForFunction(value =>
            document.querySelector('[data-testid="text-sidebar-name"]')?.textContent === value, value);
          check(await tabA.getByTestId(field).inputValue() === value, "Saved profile is not visible");
          check(await tabA.getByTestId("input-organization").inputValue() === value, "Organization is not visible");
        } else {
          await tabA.getByRole("dialog").waitFor({ state: "hidden" });
          await tabA.getByText(value, { exact: true }).waitFor();
        }
        check(await tabA.getByRole("alert").filter({ hasText: "Sesi akun berubah" }).count() === 0,
          "Same-account renewal showed an account-change error");
        check(await tabA.evaluate(token => window.__missedAccountNotifications.documentToken === token, documentToken),
          "Tab A reloaded; old draft was not exercised");
        const persisted = await api(tabA, owner, scenario === "profile" ? "/api/me"
          : scenario === "case-create" ? "/api/cases" : `/api/cases/${caseRow.id}/evidence`);
        const row = scenario === "profile" ? persisted : persisted.find(row => row.id === body.id);
        check(row && (row.displayName ?? row.companyName ?? row.title) === value, "Saved draft is absent from API");
        if (scenario === "profile") check(row.organizationName === value, "Organization was not persisted");
        if (scenario.startsWith("evidence")) check(row.note === note, "Evidence note was not persisted");
        const after = await snapshotOwners([owner]);
        const dbRow = scenario === "profile" ? after.profiles.find(row => row.user_id === owner)
          : (scenario === "case-create" ? after.cases : after.evidence).find(row => row.id === body.id);
        check(dbRow && (dbRow.display_name ?? dbRow.company_name ?? dbRow.title) === value,
          "Draft value was not persisted in the database");
        if (scenario === "profile") check(dbRow.organization_name === value, "Database lost organization");
        if (scenario.startsWith("evidence")) check(dbRow.note === note, "Database lost evidence note");
        check(JSON.stringify(before) !== JSON.stringify(after), "Database did not change after saving");
        report.push({
          scenario, newSessionSameAccount: true, ownerHeaderRetained: true,
          oldDocumentRetained: true, status: saved.status(), visible: true,
          apiPersisted: true, databasePersisted: true,
          blockedNotifications: await tabA.evaluate(() => ({
            storage: window.__missedAccountNotifications.storage,
            channel: window.__missedAccountNotifications.channel,
          })),
        });
      } finally {
        await context.close();
      }
    }
    return report;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await cleanupOwners(fixtures);
    } catch (cleanupError) {
      if (primaryError) throw new AggregateError([primaryError, cleanupError], "Regression and scoped cleanup failed");
      throw cleanupError;
    }
  }
}
