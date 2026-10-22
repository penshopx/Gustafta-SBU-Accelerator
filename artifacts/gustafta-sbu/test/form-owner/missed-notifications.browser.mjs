/**
 * Real-browser regression. Run with the testing notebook's browser/Clerk bridge
 * (see README.md). No application responses or mutation headers are mocked.
 */
export async function runMissedNotificationsRegression({
  browser, baseURL, signInClerkUser, snapshotOwners, cleanupOwners,
  scenarios = ["profile", "case-create", "evidence-create", "evidence-edit"],
  checkpointFixtures,
}) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  check(typeof snapshotOwners === "function", "A database snapshot callback is required");
  check(typeof cleanupOwners === "function", "A scoped cleanup callback is required");
  check(typeof checkpointFixtures === "function", "A private fixture checkpoint callback is required");
  const supported = ["profile", "case-create", "evidence-create", "evidence-edit"];
  check(Array.isArray(scenarios) && scenarios.length > 0
    && new Set(scenarios).size === scenarios.length
    && scenarios.every(scenario => supported.includes(scenario)), "Invalid scenario selection");
  const report = [];
  const fixtures = [];
  let primaryError;
  const api = async (page, owner, path, method = "GET", data) => {
    check(typeof owner === "string" && owner.length > 0, "An expected API owner is required");
    const result = await page.evaluate(async ({ path, method, data, owner }) => {
      const response = await fetch(path, {
        method, credentials: "same-origin", cache: "no-store",
        headers: {
          ...(data ? { "Content-Type": "application/json" } : {}),
          "X-SBU-Form-Owner": owner,
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }, { path, method, data, owner });
    check(result.status >= 200 && result.status < 300, `${method} ${path} failed (${result.status})`);
    return result.data;
  };
  const authenticatedOwner = async (page, previousOwner) => {
    // Bootstrap from Clerk's signed-in session, not an unbound private /me
    // request. Wait for the ticket exchange to reach the real shared cookie jar.
    await page.waitForFunction(previous => {
      const session = window.Clerk?.session;
      return window.Clerk?.loaded && session?.user?.id
        && session.user.id !== previous;
    }, previousOwner);
    const candidate = await page.evaluate(() => window.Clerk.session.user.id);
    const deadline = Date.now() + 30_000;
    let cookieMatches = false;
    do {
      const cookie = (await page.context().cookies(baseURL))
        .find(cookie => cookie.name === "__session" && cookie.value);
      if (cookie) {
        const claims = JSON.parse(atob(cookie.value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        cookieMatches = claims.sub === candidate;
        if (cookieMatches) break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    check(cookieMatches, "Timed out waiting for the authenticated shared cookie");
    // Decoded claims are only a readiness signal. The server verifies the real
    // cookie's signature/issuer and binds this private read to the candidate.
    check((await api(page, candidate, "/api/me")).userId === candidate,
      "Server-verified identity differs from the signed-in session");
    return candidate;
  };
  const caseInput = name => ({
    companyName: name, classification: "BG001", requestType: "baru", qualification: "kecil",
  });
  const completeProfile = (page, owner, name) => api(page, owner, "/api/me", "PATCH", {
    displayName: name, organizationName: "Synthetic regression fixture", role: "kontraktor",
  });
  const prepareCase = async (page, name) => {
    await page.getByTestId("button-create-case").click();
    await page.getByTestId("input-company-name").fill(name);
    await page.getByTestId("input-classification").fill("BG001");
  };
  const prepareEvidence = async (page, title, editingId) => {
    await page.getByTestId(editingId ? `button-edit-evidence-${editingId}` : "button-add-evidence").click();
    if (!editingId) await page.getByTestId("select-evidence-code").selectOption("keuangan");
    await page.getByTestId("input-evidence-title").fill(title);
    await page.getByTestId("input-evidence-note").fill("Synthetic declaration, not verified evidence");
  };
  const waitForWrite = (page, path, method) => page.waitForResponse(response =>
    new URL(response.url()).pathname === path && response.request().method() === method,
  );
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({ baseURL });
      let scenarioError;
      try {
        const tabA = await context.newPage();
        const tabB = await context.newPage();
        // Install before any app code. Fault injection is restricted to tab A.
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
          // Keep Clerk's JS cookie view stale, but NOT the browser cookie jar.
          // Suppress old SDK cookie writes so they cannot restore A's session.
          const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
          Object.defineProperty(document, "cookie", {
            configurable: true,
            get() { return state.armed ? state.cookie : descriptor.get.call(document); },
            set(value) { if (!state.armed) descriptor.set.call(document, value); },
          });
        });
        let armed = false;
        // Disconnect only tab A's Clerk SDK refresh path, not any SBU API call.
        await tabA.route("**/*", async route => {
          const url = new URL(route.request().url());
          const clerkRequest = url.hostname.endsWith(".clerk.accounts.dev")
            || url.hostname.endsWith(".clerk.com") || url.pathname.startsWith("/api/__clerk/");
          if (armed && clerkRequest) await route.abort("blockedbyclient");
          else await route.continue();
        });
        const suffix = `${Date.now()}-${scenario}-${Math.random().toString(36).slice(2, 8)}`;
        const people = {
          a: { firstName: "Draft", lastName: "Alpha", email: `draft-a-${suffix}@example.com`, basePath: "/" },
          b: { firstName: "Draft", lastName: "Beta", email: `draft-b-${suffix}@example.com`, basePath: "/" },
        };
        const names = { a: `Fixture Alpha ${suffix}`, b: `Fixture Beta ${suffix}` };
        const staleValue = `Rejected draft ${suffix}`;
        const freshValue = `Accepted draft ${suffix}`;
        const fixture = { owners: [], names: [], emails: [people.a.email, people.b.email] };
        fixtures.push(fixture);
        // Stage exact emails before account creation: a worker reset may skip
        // finally, or sign-in may create a user before returning its redirect.
        await checkpointFixtures(fixtures);
        await tabB.goto(await signInClerkUser(people.b));
        const ownerB = await authenticatedOwner(tabB);
        fixture.owners.push(ownerB); fixture.names.push(names.b);
        await checkpointFixtures(fixtures);
        await completeProfile(tabB, ownerB, names.b);
        const caseB = await api(tabB, ownerB, "/api/cases", "POST", caseInput(`Beta case ${suffix}`));
        const evidenceB = await api(tabB, ownerB, `/api/cases/${caseB.id}/evidence`, "POST", {
          code: "legalitas", title: `Beta original ${suffix}`, note: "Original B note",
        });
        await tabB.goto(await signInClerkUser(people.a));
        const ownerA = await authenticatedOwner(tabB, ownerB);
        fixture.owners.push(ownerA); fixture.names.push(names.a);
        await checkpointFixtures(fixtures);
        check(ownerA !== ownerB, "Two different authenticated accounts are required");
        await completeProfile(tabB, ownerA, names.a);
        const caseA = await api(tabB, ownerA, "/api/cases", "POST", caseInput(`Alpha case ${suffix}`));
        const evidenceA = await api(tabB, ownerA, `/api/cases/${caseA.id}/evidence`, "POST", {
          code: "legalitas", title: `Alpha original ${suffix}`, note: "Original A note",
        });
        await tabA.goto(scenario === "profile" ? "/settings"
          : scenario === "case-create" ? "/cases" : `/cases/${caseA.id}`);
        await tabA.getByTestId("text-sidebar-name").waitFor();
        check(await tabA.getByTestId("text-sidebar-name").innerText() === names.a, "Draft did not mount as A");
        if (scenario === "profile") {
          await tabA.getByTestId("input-display-name").fill(staleValue);
          await tabA.getByTestId("input-organization").fill(staleValue);
        } else if (scenario === "case-create") {
          await prepareCase(tabA, staleValue);
        } else {
          await prepareEvidence(tabA, staleValue, scenario === "evidence-edit" ? evidenceA.id : undefined);
        }
        const documentToken = await tabA.evaluate(owner => {
          const state = window.__missedAccountNotifications;
          state.owner = owner; state.cookie = document.cookie; state.armed = true;
          return state.documentToken;
        }, ownerA);
        armed = true;
        const before = await snapshotOwners(fixture.owners);
        // This navigation really changes the shared cookie via the second tab.
        // It does not touch tab A's React tree or its immutable draft owner.
        await tabB.goto(await signInClerkUser(people.b));
        check(await authenticatedOwner(tabB, ownerA) === ownerB, "Tab B did not authenticate as B");
        await tabB.evaluate(owner => {
          localStorage.setItem("gustafta:active-account", owner);
          const channel = new BroadcastChannel("gustafta:active-account");
          channel.postMessage(owner);
          setTimeout(() => channel.close(), 100);
        }, ownerB);
        await tabA.waitForFunction(() => {
          const state = window.__missedAccountNotifications;
          return state.storage > 0 && state.channel > 0;
        });
        // Same tab, real fetch: proves browser cookies are B even while JS is A.
        check((await api(tabA, ownerB, "/api/me")).userId === ownerB, "Tab A's actual network cookie is not B");
        check(await tabA.getByTestId("text-sidebar-name").innerText() === names.a, "A's identity changed before submission");
        const oldField = scenario === "profile" ? "input-display-name"
          : scenario === "case-create" ? "input-company-name" : "input-evidence-title";
        check(await tabA.getByTestId(oldField).inputValue() === staleValue, "Old draft was replaced");
        const path = scenario === "profile" ? "/api/me" : scenario === "case-create" ? "/api/cases"
          : `/api/cases/${caseA.id}/evidence${scenario === "evidence-edit" ? `/${evidenceA.id}` : ""}`;
        const method = scenario === "profile" || scenario === "evidence-edit" ? "PATCH" : "POST";
        const button = scenario === "profile" ? "button-save-profile"
          : scenario === "case-create" ? "button-save-case" : "button-save-evidence";
        const rejection = waitForWrite(tabA, path, method);
        await tabA.getByTestId(button).click();
        const response = await rejection;
        check(response.status() === 409, `${scenario}: old draft was not rejected with 409`);
        check(response.request().headers()["x-sbu-form-owner"] === ownerA, "Draft owner header was not A");
        check(!response.request().headers().authorization, "Mutation unexpectedly used bearer authentication");
        const alert = tabA.getByRole("alert").filter({ hasText: "Sesi akun berubah" });
        await alert.waitFor({ state: "visible" });
        check((await alert.innerText()).includes("Muat ulang"), "Rejection omitted recovery instructions");
        check(await tabA.getByTestId(oldField).inputValue() === staleValue, "Rejection lost the old draft");
        check(await tabA.evaluate(token => window.__missedAccountNotifications.documentToken === token, documentToken),
          "Tab A reloaded; stale-tree regression was not exercised");
        check(JSON.stringify(await snapshotOwners(fixture.owners)) === JSON.stringify(before),
          `${scenario}: rejection changed persisted data for A or B`);
        // A normal new B document must still work; no fault injection in tab B.
        await tabB.goto(scenario === "profile" ? "/settings"
          : scenario === "case-create" ? "/cases" : `/cases/${caseB.id}`);
        await tabB.getByTestId("text-sidebar-name").waitFor();
        check(await tabB.getByTestId("text-sidebar-name").innerText() === names.b, "New form did not mount as B");
        if (scenario === "profile") {
          await tabB.getByTestId("input-display-name").fill(freshValue);
          await tabB.getByTestId("input-organization").fill(freshValue);
        } else if (scenario === "case-create") {
          await prepareCase(tabB, freshValue);
        } else {
          await prepareEvidence(tabB, freshValue, scenario === "evidence-edit" ? evidenceB.id : undefined);
        }
        const freshPath = scenario === "profile" ? "/api/me" : scenario === "case-create" ? "/api/cases"
          : `/api/cases/${caseB.id}/evidence${scenario === "evidence-edit" ? `/${evidenceB.id}` : ""}`;
        const success = waitForWrite(tabB, freshPath, method);
        await tabB.getByTestId(button).click();
        const saved = await success;
        check(saved.status() === (method === "POST" ? 201 : 200), `${scenario}: fresh B form failed`);
        check(saved.request().headers()["x-sbu-form-owner"] === ownerB, "New form owner header was not B");
        if (scenario === "profile") {
          // Settings keys ProfileForm by saved values, so a real update
          // remounts it and clears the mutation's transient isSuccess message.
          // Require the saved identity to be visible, not that lost status.
          await tabB.waitForFunction(name =>
            document.querySelector('[data-testid="text-sidebar-name"]')?.textContent === name, freshValue);
          check(await tabB.getByTestId("input-display-name").inputValue() === freshValue,
            "Saved B profile was not visible in the new form");
          check((await api(tabB, ownerB, "/api/me")).displayName === freshValue, "B profile was not persisted");
        } else {
          await tabB.getByRole("dialog").waitFor({ state: "hidden" });
          await tabB.getByText(freshValue, { exact: true }).waitFor();
          const rows = await api(tabB, ownerB, scenario === "case-create" ? "/api/cases" : `/api/cases/${caseB.id}/evidence`);
          check(rows.some(row => (row.companyName ?? row.title) === freshValue), "B write was not persisted");
          check(!rows.some(row => (row.companyName ?? row.title) === staleValue), "Old draft appeared in B data");
        }
        report.push({
          scenario, rejectionStatus: response.status(), staleOwnerHeader: true,
          staleDocumentRetained: true, rejectionVisible: true, databaseUnchanged: true,
          blockedNotifications: await tabA.evaluate(() => ({
            storage: window.__missedAccountNotifications.storage,
            channel: window.__missedAccountNotifications.channel,
          })),
          freshBStatus: saved.status(), freshBVisibleAndPersisted: true,
        });
      } catch (error) {
        scenarioError = error;
        throw error;
      } finally {
        try {
          await context.close();
        } catch (closeError) {
          if (scenarioError) throw new AggregateError([scenarioError, closeError], "Regression and browser close failed");
          throw closeError;
        }
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
