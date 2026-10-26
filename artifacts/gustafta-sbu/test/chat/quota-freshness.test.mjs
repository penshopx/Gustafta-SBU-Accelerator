import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';
import { setTimeout as delay } from 'node:timers/promises';

const root = dirname(fileURLToPath(import.meta.url));
const A = 'synthetic-chat-owner', B = 'synthetic-chat-owner-b';
const beforeReset = '2026-10-20T23:59:50Z'; // 06.59.50 WIB
const resetAt = '2026-10-21T00:00:00Z'; // 07.00 WIB
const draft = 'Draf sintetis untuk regresi kuota.';
const quotaFor = (owner, now, used) => ({
  userId: owner, dailyLimit: 30, dailyRemaining: 30 - used,
  minuteLimit: 6, minuteRemaining: 6 - used, busy: false, retryAfterSeconds: 0,
  dailyResetAt: now >= Date.parse(resetAt) ? '2026-10-22T00:00:00Z' : resetAt,
  minuteResetAt: new Date(Math.floor(now / 60000) * 60000 + 60000).toISOString(),
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const quotaText = (daily, minute) =>
  `Sisa kuota: ${daily} dari 30 percobaan harian; ${minute} dari 6 percobaan menit ini.`;

async function seeQuota(page, daily, minute) {
  await settle(page, () => page.evaluate(text =>
    document.querySelector('[data-testid="text-chat-quota"]')?.textContent.includes(text),
  quotaText(daily, minute)));
}

async function seeSend(page, enabled) {
  await settle(page, async () => (await page.getByTestId('button-send-chat').isEnabled()) === enabled);
}

async function settle(page, predicate) {
  // Query notifications use setTimeout(0). Flush those while the clock is
  // paused, instead of waiting on browser rAF (which is itself paused).
  for (let attempt = 0; attempt < 150; attempt++) {
    await page.clock.runFor(1);
    if (await predicate()) return;
    await delay(10);
  }
  assert.fail(`UI did not settle: ${await page.locator('body').innerText()}`);
}

// Chromium headless keeps both pages "visible", even after bringToFront().
// Change only the browser visibility signal; retain TanStack's real listener,
// polling timers, hooks, fetch client and React rendering. This is not a claim
// about native OS suspension, BFCache or Clerk authentication.
async function visibility(page, state) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  }, state);
}

test('browser quota freshness and fail-closed recovery with synthetic accounts', { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sbu-chat-quota-'));
  let browser, server;
  try {
    await build({
      configFile: false, root, base: '/', logLevel: 'error',
      esbuild: { jsx: 'automatic' },
      resolve: { alias: { '@': resolve(root, '../../src') }, dedupe: ['react', 'react-dom'] },
      build: { outDir: directory, emptyOutDir: true },
    });
    server = createServer(async (req, res) => {
      const path = new URL(req.url, 'http://fixture.invalid').pathname;
      if (path !== '/' && !/^\/assets\/[\w.-]+$/.test(path)) { res.writeHead(404).end(); return; }
      try {
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
        res.end(await readFile(resolve(directory, path === '/' ? 'index.html' : path.slice(1))));
      } catch { res.writeHead(404).end(); }
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      executablePath: process.env.CHAT_CHROMIUM_PATH || '/repl/tools/bin/chromium',
      headless: true, args: ['--no-sandbox'],
    });

    async function scenario(run) {
      const context = await browser.newContext();
      const errors = [], requests = [], sent = [], gates = [];
      const state = { now: Date.parse(beforeReset), used: { [A]: 2, [B]: 5 }, fail: false, hold: null,
        budget: 'available', budgetFail: false, budgetOwner: null, budgetAfterSend: null };
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        const json = (body, status = 200) => route.fulfill({
          status, contentType: 'application/json', body: JSON.stringify(body),
        });
        if (url.origin === origin && url.pathname === '/api/openai/sbu/specialists' && req.method() === 'GET') {
          return json([{ id: 'sbuclaw', name: 'Spesialis sintetis', group: 'Sintetis',
            description: 'Fixture kuota', prompts: ['Pertanyaan sintetis'], knowledgeStatus: 'Data sintetis.' }]);
        }
        if (url.origin === origin && url.pathname === '/api/openai/sbu/budget' && req.method() === 'GET') {
          const owner = req.headers()['x-sbu-form-owner'];
          assert.ok(owner === A || owner === B);
          return state.budgetFail ? json({ error: 'Synthetic budget read failure' }, 503)
            : json({ userId: state.budgetOwner ?? owner, status: state.budget,
              checkedAt: new Date(state.now).toISOString(), nextResetAt: null });
        }
        if (url.origin === origin && url.pathname === '/api/openai/sbu/quota' && req.method() === 'GET') {
          const owner = req.headers()['x-sbu-form-owner'];
          assert.ok(owner === A || owner === B);
          requests.push(owner);
          const response = quotaFor(owner, state.now, state.used[owner]);
          const hold = state.hold;
          if (hold?.owner === owner) {
            state.hold = null;
            hold.started.resolve();
            await hold.release.promise;
          }
          return state.fail ? json({ message: 'Gangguan kuota sintetis' }, 503) : json(response);
        }
        if (url.origin === origin && url.pathname === '/api/openai/sbu/messages' && req.method() === 'POST') {
          const owner = req.headers()['x-sbu-form-owner'], body = req.postDataJSON();
          assert.ok(owner === A || owner === B);
          sent.push({ owner, body });
          state.used[owner]++;
          if (state.budgetAfterSend) state.budget = state.budgetAfterSend;
          return json({ userId: owner, mode: body.mode, specialist: body.specialist,
            quota: quotaFor(owner, state.now, state.used[owner]), answer: 'Jawaban sintetis.',
            citations: [], retrievalNotice: 'Tidak ada sumber nyata dalam fixture.' });
        }
        if (url.origin === origin && req.method() === 'GET' &&
            (url.pathname === '/' || /^\/assets\/[\w.-]+$/.test(url.pathname))) return route.continue();
        errors.push(`Unexpected network: ${req.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      });
      const open = async () => {
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install({ time: new Date(beforeReset) });
        await page.clock.pauseAt(new Date(beforeReset));
        await page.goto(`${origin}/?quota=1`);
        await seeQuota(page, 28, 4);
        await page.getByTestId('checkbox-consent').check();
        await page.getByTestId('input-chat-message').fill(draft);
        await seeSend(page, true);
        return page;
      };
      const holdNext = owner => {
        const hold = { owner, started: deferred(), release: deferred() };
        gates.push(hold);
        state.hold = hold;
        return hold;
      };
      try {
        await run({ open, state, requests, sent, holdNext });
        assert.deepEqual(errors, []);
      } finally {
        for (const gate of gates) gate.release.resolve();
        await context.close();
      }
    }

    await t.test('shared exhaustion blocks button and Enter, preserves draft, recovers without paid retries and refreshes after send', async () => {
      await scenario(async ({ open, state, sent }) => {
        const page = await open();
        state.budget = 'exhausted';
        await page.getByTestId('button-refresh-chat-budget').click();
        await seeSend(page, false);
        await settle(page, () => page.getByTestId('text-chat-budget').innerText().then(text => text.includes('meskipun kuota akun')));
        await seeQuota(page, 28, 4);
        await page.getByTestId('input-chat-message').press('Enter');
        assert.equal(sent.length, 0);
        assert.equal(await page.getByTestId('input-chat-message').inputValue(), draft);
        state.budget = 'available';
        await page.getByTestId('button-refresh-chat-budget').click();
        await seeSend(page, true);
        assert.equal(await page.getByTestId('input-chat-message').inputValue(), draft);
        state.budgetAfterSend = 'exhausted';
        await page.getByTestId('button-send-chat').click();
        await seeQuota(page, 27, 3);
        await settle(page, () => page.getByTestId('text-chat-budget').innerText().then(text => text.includes('meskipun kuota akun')));
        await page.getByTestId('input-chat-message').fill(draft);
        await seeSend(page, false);
        assert.equal(sent.length, 1, "only the explicitly clicked synthetic send occurred");
      });
    });

    await t.test('budget read errors and wrong owner remain fail-closed with the draft intact', async () => {
      await scenario(async ({ open, state, sent }) => {
        const page = await open();
        for (const failure of ['unavailable', 'network', 'wrong-owner']) {
          state.budget = failure === 'unavailable' ? 'unavailable' : 'available';
          state.budgetFail = failure === 'network';
          state.budgetOwner = failure === 'wrong-owner' ? B : null;
          await page.getByTestId('button-refresh-chat-budget').click();
          await seeSend(page, false);
          await settle(page, () => page.getByTestId('text-chat-budget').innerText().then(text => text.includes('belum dapat diverifikasi')));
          await page.getByTestId('input-chat-message').press('Enter');
          assert.equal(sent.length, 0);
          assert.equal(await page.getByTestId('input-chat-message').inputValue(), draft);
        }
        state.budget = 'available'; state.budgetFail = false; state.budgetOwner = null;
        await page.getByTestId('button-refresh-chat-budget').click();
        await seeSend(page, true);
      });
    });

    await t.test('two tabs: send refreshes the other tab via polling and independently via focus', async () => {
      await scenario(async ({ open, sent, requests }) => {
        const first = await open(), second = await open();
        await first.getByTestId('button-send-chat').click();
        await seeQuota(first, 27, 3);
        // No shared query client and no explicit invalidation in the reader.
        await seeQuota(second, 28, 4);
        const reads = requests.length;
        await second.clock.runFor(15000);
        await seeQuota(second, 27, 3);
        assert.ok(requests.length > reads);
        assert.equal(await second.getByTestId('input-chat-message').inputValue(), draft);

        await visibility(second, 'hidden');
        await first.getByTestId('input-chat-message').fill(draft);
        await first.getByTestId('button-send-chat').click();
        await seeQuota(first, 26, 2);
        await seeQuota(second, 27, 3);
        const beforeFocus = requests.length;
        await visibility(second, 'visible');
        await seeQuota(second, 26, 2);
        assert.ok(requests.length > beforeFocus);
        assert.equal(sent.length, 2);
        for (const message of sent) {
          assert.equal(message.owner, A);
          assert.equal(message.body.consent, true);
          assert.equal(message.body.messages.at(-1).content, draft);
        }
      });
    });

    await t.test('sleeping tab crossing 07.00 WIB fetches the next day quota on return', async () => {
      await scenario(async ({ open, state, requests }) => {
        const page = await open();
        assert.match(await page.getByTestId('text-chat-quota').innerText(), /21\/10\/2026/);
        await visibility(page, 'hidden');
        const reads = requests.length;
        // Jump wall time without firing polling timers, like a suspended tab.
        state.now = Date.parse('2026-10-21T00:01:00Z');
        state.used[A] = 0;
        await page.clock.setSystemTime(new Date(state.now));
        assert.equal(requests.length, reads);
        await seeQuota(page, 28, 4);
        await visibility(page, 'visible');
        await seeQuota(page, 30, 6);
        assert.ok(requests.length > reads);
        assert.match(await page.getByTestId('text-chat-quota').innerText(), /22\/10\/2026/);
        assert.equal(await page.getByTestId('input-chat-message').inputValue(), draft);
        await seeSend(page, true);
      });
    });

    await t.test('account change hides previous quota during loading and ignores its late response', async () => {
      await scenario(async ({ open, holdNext, requests }) => {
        const page = await open();
        const old = holdNext(A);
        await page.clock.runFor(15000);
        await old.started.promise;
        const next = holdNext(B);
        await page.evaluate(() => {
          window.quotaSnapshots = [];
          window.quotaObserver = new MutationObserver(() => window.quotaSnapshots.push({
            owner: document.querySelector('[data-testid="fixture-owner"]')?.textContent,
            quota: document.querySelector('[data-testid="text-chat-quota"]')?.textContent ?? '',
          }));
          window.quotaObserver.observe(document.getElementById('root'), { subtree: true, childList: true, characterData: true });
        });
        await page.getByRole('button', { name: 'Akun sintetis B', exact: true }).click();
        await next.started.promise;
        assert.equal(await page.getByTestId('text-chat-quota').count(), 0);
        assert.match(await page.locator('body').innerText(), /Memeriksa kuota asisten/);
        await seeSend(page, false);
        assert.equal(await page.getByTestId('input-chat-message').inputValue(), '');
        old.release.resolve();
        next.release.resolve();
        await seeQuota(page, 25, 1);
        assert.deepEqual(requests, [A, A, B]);
        const snapshots = await page.evaluate(() => window.quotaSnapshots);
        assert.ok(snapshots.some(snapshot => snapshot.owner === B && snapshot.quota === ''), 'record loading interval');
        assert.ok(snapshots.some(snapshot => snapshot.owner === B && snapshot.quota.includes('25 dari 30')), 'record B quota');
        assert.ok(snapshots.filter(snapshot => snapshot.owner === B).every(snapshot => !snapshot.quota.includes('28 dari 30')));
        await page.evaluate(() => window.quotaObserver.disconnect());
        // Returning to A must fetch afresh, not revive its discarded cache.
        const back = holdNext(A);
        await page.getByRole('button', { name: 'Akun sintetis A', exact: true }).click();
        await back.started.promise;
        assert.equal(await page.getByTestId('text-chat-quota').count(), 0);
        back.release.resolve();
        await seeQuota(page, 28, 4);
      });
    });

    await t.test('GET failure blocks button and Enter; Periksa lagi restores send without losing draft', async () => {
      await scenario(async ({ open, state, sent, requests }) => {
        const page = await open();
        state.fail = true;
        await page.clock.runFor(15000);
        const retry = page.getByRole('button', { name: 'Periksa lagi', exact: true });
        await settle(page, () => retry.isVisible());
        assert.equal(await page.getByTestId('text-chat-quota').count(), 0, 'cached success must not remain visible');
        await seeSend(page, false);
        await page.getByTestId('input-chat-message').press('Enter');
        assert.equal(sent.length, 0, 'keyboard must not bypass failed quota check');
        assert.equal(await page.getByTestId('input-chat-message').inputValue(), draft);
        state.fail = false;
        const reads = requests.length;
        await retry.click();
        await seeQuota(page, 28, 4);
        await seeSend(page, true);
        assert.equal(requests.length, reads + 1);
        assert.equal(await page.getByTestId('input-chat-message').inputValue(), draft);
        assert.equal(await page.getByTestId('checkbox-consent').isChecked(), true);
        await page.getByTestId('button-send-chat').click();
        await seeQuota(page, 27, 3);
        assert.equal(sent.length, 1);
        assert.deepEqual(sent[0].body.messages, [{ role: 'user', content: draft }]);
        assert.equal(await page.getByTestId('input-chat-message').inputValue(), '');
      });
    });
    t.diagnostic(`Chromium ${browser.version()}; real components, isolated tab caches, controlled time/visibility, intercepted API only; no AI or private data.`);
  } finally {
    await browser?.close();
    if (server) await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  }
});
