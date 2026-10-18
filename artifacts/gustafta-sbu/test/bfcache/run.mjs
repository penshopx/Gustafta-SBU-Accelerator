import { createClerkClient } from '@clerk/backend';
import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { startFixtureServer } from './fixture-server.mjs';
import { installProbe, assertEvidence } from './probe.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(app, '../../generated-artifacts/bfcache/report.json');
const knownFailures = new Set([
  'TEST_CLERK_KEYS_REQUIRED', 'BUILD_FAILED', 'BFCACHE_DISABLED_BY_LAUNCH',
  'BFCACHE_INACTIVE', 'FIRST_RESTORED_FRAME_MISSING', 'PRIVATE_SURFACE_LEAK',
  'IDENTITY_RESPONSE_ORDER_NOT_PROVEN', 'SHELL_OPENED_ON_VERIFICATION_FAILURE',
  'PENDING_VERIFICATION_NOT_CONCEALED', 'UNEXPECTED_API_ROUTE', 'FIXTURE_OWNER_MISMATCH',
  'ME_RESPONSE_MISSING', 'A_CASE_NOT_DENIED', 'PRODUCTION_BUNDLE_REQUIRED',
  'ME_FAILURE_NOT_PROVEN',
]);
const requireThat = (ok, code) => { if (!ok) throw new Error(code); };
const waitUntil = async (predicate, code, timeout = 20_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await predicate()) return; }
    catch (error) {
      // The production guard reloads during native pageshow. Poll the next
      // execution context, but never swallow a closed browser or other failures.
      if (!/Execution context was destroyed|Cannot find context with specified id/.test(error.message)) throw error;
    }
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error(code);
};
const build = (outDir) => new Promise((done, reject) => {
  // Suppress raw build output: third-party errors can include environment values.
  const child = spawn('pnpm', ['exec', 'vite', 'build', '--outDir', outDir], {
    cwd: app, stdio: 'ignore',
    env: { ...process.env, PORT: '1', BASE_PATH: '/', NODE_ENV: 'production', VITE_CLERK_PROXY_URL: '' },
  });
  child.once('error', () => reject(new Error('BUILD_FAILED')));
  child.once('exit', (code) => code === 0 ? done() : reject(new Error('BUILD_FAILED')));
});

export async function run() {
  const report = {
    status: 'failed', scope: 'Chromium production bundle with real test Clerk sessions and isolated in-memory API fixtures; not a live API authorization test.',
    browser: {}, scenarios: [], failure: null,
    cleanup: { browserClosed: false, serverClosed: false, temporaryBuildRemoved: false, usersCreated: 0, usersDeleted: 0, failures: [] },
    workflowModified: false,
  };
  let browser, service, temporary, clerk;
  const users = [];
  const suffix = randomUUID();
  const marker = `Private BFCache ${suffix}`;
  let stage = 'preflight';
  const records = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('__bfcache_report') || '[]'));
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    requireThat(secretKey?.startsWith('sk_test_') && publishableKey?.startsWith('pk_test_'), 'TEST_CLERK_KEYS_REQUIRED');
    clerk = createClerkClient({ secretKey, publishableKey });
    // Preflight before creating accounts. A new process, not a context in a browser
    // whose parent launch may already disable BFCache.
    browser = await chromium.launch({
      executablePath: process.env.BFCACHE_CHROMIUM_PATH || '/repl/tools/bin/chromium',
      headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'],
      args: ['--no-sandbox', '--enable-automation'],
    });
    const preflight = await browser.newContext();
    const page = await preflight.newPage();
    const cdp = await preflight.newCDPSession(page);
    const { arguments: flags } = await cdp.send('Browser.getBrowserCommandLine');
    requireThat(!flags.some((flag) => flag === '--disable-back-forward-cache' ||
      flag.startsWith('--disable-features=') && flag.includes('BackForwardCache')), 'BFCACHE_DISABLED_BY_LAUNCH');
    report.browser = { engine: 'Chromium', version: browser.version(), disableBackForwardCacheArgumentPresent: false };
    await preflight.close();
    stage = 'production-build';
    temporary = await mkdtemp(resolve(tmpdir(), 'gustafta-bfcache-'));
    await build(temporary);
    report.productionBundleBuilt = true;
    stage = 'create-test-users';
    for (const label of ['a', 'b']) {
      const email = `bfcache-${label}-${suffix}@example.com`;
      const user = await clerk.users.createUser({
        emailAddress: [email], firstName: 'Cache', lastName: label === 'a' ? 'Alpha' : 'Beta',
        skipPasswordRequirement: true,
      });
      users.push({ id: user.id, email });
      report.cleanup.usersCreated++;
    }
    service = await startFixtureServer({
      bundle: temporary, clerk, publishableKey,
      owners: { a: users[0].id, b: users[1].id }, marker,
    });
    const signIn = async (tab, user) => {
      const ticket = await clerk.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 120 });
      await tab.goto(service.origin + '/__bfcache/login');
      await tab.waitForFunction(() => !!window.Clerk);
      await tab.evaluate(async ({ token, publishableKey }) => {
        await window.Clerk.load({ publishableKey });
        const result = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: token });
        await window.Clerk.setActive({ session: result.createdSessionId });
      }, { token: ticket.token, publishableKey });
      await tab.waitForFunction((id) => window.Clerk.user?.id === id, user.id);
    };
    // Separate context per scenario: no inherited cookies, caches or app publisher.
    for (const scenario of [
      { name: 'dashboard-back', path: '/dashboard', direction: 'back' },
      { name: 'dashboard-forward', path: '/dashboard', direction: 'forward' },
      { name: 'detail-back', path: '/cases/1', direction: 'back' },
      { name: 'detail-forward', path: '/cases/1', direction: 'forward' },
      { name: 'verification-failure', path: '/dashboard', direction: 'back', failure: true },
    ]) {
      stage = scenario.name;
      console.log(`BFCache scenario: ${scenario.name}`);
      const result = { name: scenario.name, status: 'failed', events: [], requests: [] };
      report.scenarios.push(result);
      const requestStart = service.requests.length;
      const context = await browser.newContext({ baseURL: service.origin, timezoneId: 'UTC' });
      try {
        await context.addInitScript(installProbe, { marker, bId: users[1].id });
        const target = await context.newPage();
        const sibling = await context.newPage();
        service.setMode('normal');
        stage = scenario.name + '/prepare-B';
        // Prepare B before freezing A. Even Clerk's own SDK BroadcastChannel
        // can evict a frozen page, independently of Gustafta's publisher.
        await signIn(sibling, users[1]);
        const bCookies = await context.cookies();
        await sibling.goto('/__bfcache/away');
        await context.clearCookies();
        stage = scenario.name + '/sign-in-A';
        await signIn(target, users[0]);
        stage = scenario.name + '/load-A';
        await target.goto('/__bfcache/away');
        await target.goto(scenario.path);
        await target.getByTestId('text-sidebar-name').filter({ hasText: 'Cache Alpha' }).waitFor({ state: 'visible' });
        await target.getByText(marker, { exact: true }).first().waitFor({ state: 'visible' });
        requireThat(!await target.locator('script[src*="/@vite/client"]').count(), 'PRODUCTION_BUNDLE_REQUIRED');
        result.viteClientPresent = false;
        if (scenario.direction === 'forward') {
          // Freeze A via Back; Forward must restore the same saved document.
          await target.goBack({ waitUntil: 'commit' });
        } else {
          await target.goto('/__bfcache/away');
        }
        stage = scenario.name + '/silent-switch-B';
        // Restore a real preauthenticated B cookie jar, in memory only. No SDK,
        // app publisher, storage message, route interception or synthetic event.
        await context.clearCookies();
        await context.addCookies(bCookies);
        const siblingIsB = await sibling.evaluate(async (bId) => {
          const response = await fetch('/api/me', { cache: 'no-store', headers: { 'X-SBU-Form-Owner': bId } });
          return response.status === 200 && (await response.json()).userId === bId;
        }, users[1].id);
        requireThat(siblingIsB, 'FIXTURE_OWNER_MISMATCH');
        const startRequest = service.requests.length;
        service.setMode(scenario.failure ? 'fail' : 'hold');
        // Arm storage in the same origin's away page, not in the frozen document.
        await target.evaluate(() => {
          sessionStorage.setItem('__bfcache_report', '[]');
          sessionStorage.setItem('__bfcache_armed', 'yes');
        });
        // Headless Chromium also suspends rAF in background tabs. Restore the
        // target in the foreground, exactly as a user pressing Back would.
        await target.bringToFront();
        stage = scenario.name + '/restore';
        await target[scenario.direction === 'back' ? 'goBack' : 'goForward']({ waitUntil: 'commit' });
        try {
          await waitUntil(async () => (await records(target)).some((r) => r.type === 'first-restored-frame'), 'BFCACHE_INACTIVE', 5_000);
        } catch (error) {
          if (error.message === 'BFCACHE_INACTIVE') assertEvidence(await records(target), scenario);
          throw error;
        }
        if (!scenario.failure) {
          await waitUntil(() => service.requests.slice(startRequest).some((r) => r.path === '/api/me'), 'ME_RESPONSE_MISSING');
          const pending = await target.evaluate(() => ({
            sidebar: !!document.querySelector('[data-testid="text-sidebar-name"]'),
            leak: JSON.parse(sessionStorage.getItem('__bfcache_report') || '[]').some((r) => r.type === 'private-leak' || r.type === 'first-b-shell'),
          }));
          requireThat(!pending.sidebar && !pending.leak &&
            service.requests.slice(startRequest).filter((r) => r.path === '/api/me').every((r) => r.respondedAt === null),
          'PENDING_VERIFICATION_NOT_CONCEALED');
          result.pendingConcealed = true;
          service.setMode('normal');
          service.release();
          await target.getByTestId('text-sidebar-name').filter({ hasText: 'Cache Beta' }).waitFor({ state: 'visible' });
          await waitUntil(async () => (await records(target)).some((r) => r.type === 'first-b-shell'), 'IDENTITY_RESPONSE_ORDER_NOT_PROVEN');
          if (scenario.path === '/cases/1') {
            await waitUntil(() => service.requests.slice(startRequest).some((r) => r.path === '/api/cases/1' && r.isB && r.status === 404), 'A_CASE_NOT_DENIED');
          }
        } else {
          await target.getByTestId('session-verification-error').getByText('HTTP 503', { exact: false }).waitFor({ state: 'visible' });
          requireThat(service.requests.slice(startRequest).some((r) =>
            r.path === '/api/me' && r.isB && r.status === 503), 'ME_FAILURE_NOT_PROVEN');
          requireThat(!await target.getByTestId('text-sidebar-name').count(), 'SHELL_OPENED_ON_VERIFICATION_FAILURE');
        }
        result.events = await records(target);
        result.timings = assertEvidence(result.events, scenario);
        result.requests = service.requests.slice(startRequest);
        requireThat(service.unexpected.size === 0, 'UNEXPECTED_API_ROUTE');
        result.status = 'passed';
        console.log(`BFCache scenario passed: ${scenario.name}`);
      } finally {
        // Preserve sanitized failure evidence before closing its context too.
        try {
          const target = context.pages()[0];
          if (target) {
            result.events = await records(target);
            result.finalState = await target.evaluate((aId) => ({
              isDashboard: location.pathname === '/dashboard',
              isSignIn: location.pathname.includes('sign-in'),
              clerkLoaded: window.Clerk?.loaded ?? false,
              clerkIsA: window.Clerk?.user?.id === aId,
              hasSession: !!window.Clerk?.session,
              verificationError: !!document.querySelector('[data-testid="session-verification-error"]'),
            }), users[0].id);
          }
        } catch { /* A closed/crashed page is represented by the primary failure. */ }
        result.requests = service.requests.slice(requestStart);
        service.setMode('normal');
        service.release();
        try { await context.close(); }
        catch { report.cleanup.failures.push('contextClose'); }
      }
    }
    report.status = 'passed';
  } catch (error) {
    // Never serialize raw third-party exceptions, URLs, headers, tickets or IDs.
    report.failure = { stage, code: knownFailures.has(error.message) ? error.message :
      error.name === 'TimeoutError' ? 'BROWSER_TIMEOUT' : 'RUNNER_STAGE_FAILED' };
    if (Number.isInteger(error.status)) report.failure.httpStatus = error.status;
    const safeProviderCodes = new Set([
      'form_param_format_invalid', 'form_identifier_exists', 'resource_not_found',
      'authentication_invalid', 'rate_limit_exceeded', 'session_exists',
    ]);
    const codes = error.errors?.map((item) => item.code).filter((code) => safeProviderCodes.has(code));
    if (codes?.length) report.failure.providerCodes = codes;
  } finally {
    const cleanup = async (name, action) => {
      try { await action(); report.cleanup[name] = true; }
      catch { report.cleanup.failures.push(name); }
    };
    if (browser) await cleanup('browserClosed', () => browser.close());
    if (service) await cleanup('serverClosed', () => service.close());
    // Delete only exact run-owned users; an unrelated user can never pass this check.
    for (const fixture of users) {
      try {
        const current = await clerk.users.getUser(fixture.id);
        requireThat(current.emailAddresses.length === 1 && current.emailAddresses[0].emailAddress === fixture.email &&
          fixture.email.endsWith(`-${suffix}@example.com`), 'FIXTURE_OWNER_MISMATCH');
        await clerk.users.deleteUser(fixture.id);
        try {
          await clerk.users.getUser(fixture.id);
          throw new Error('FIXTURE_USER_REMAINS');
        } catch (error) {
          if (error.status !== 404) throw error;
        }
        report.cleanup.usersDeleted++;
      } catch { report.cleanup.failures.push('syntheticUserDeletion'); }
    }
    if (temporary) await cleanup('temporaryBuildRemoved', () => rm(temporary, { recursive: true, force: true }));
    if (report.cleanup.failures.length) report.status = 'failed';
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(`BFCache: ${report.status}; report: generated-artifacts/bfcache/report.json`);
    if (report.failure) console.log(`${report.failure.stage}: ${report.failure.code}`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await run();
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
