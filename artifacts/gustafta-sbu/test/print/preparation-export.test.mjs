import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';
import { installPrintProbe } from './probe.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const printError = 'Cetak belum dapat dibuka. Unduh HTML, buka berkasnya, lalu pilih Cetak di browser.';
const readError = 'Ringkasan terbaru tidak dapat dibuat. Periksa sesi Anda dan coba lagi. Tidak ada data lama yang diekspor.';
const until = (page, predicate) => page.waitForFunction(predicate);
const clean = async (page) => {
  await until(page, () => document.querySelectorAll('iframe').length === 0 && window.printProbe.timers.size === 0);
  assert.deepEqual(await page.evaluate(() => window.printProbe.frames.map((r) => ({
    connected: r.frame.isConnected, onload: r.frame.onload, listeners: r.listeners,
  }))), [{ connected: false, onload: null, listeners: 0 }]);
};

test('CasePreparationExport invokes native printing and disposes isolated print surfaces', { timeout: 120_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sbu-native-print-'));
  let browser, server;
  try {
    await build({
      configFile: false, root, base: '/', logLevel: 'error',
      esbuild: { jsx: 'automatic' },
      resolve: { dedupe: ['react', 'react-dom'] },
      build: { outDir: directory, emptyOutDir: true },
    });
    server = createServer(async (req, res) => {
      const path = req.url === '/' ? 'index.html' : req.url.slice(1);
      if (!/^(index\.html|assets\/[\w.-]+)$/.test(path)) { res.writeHead(404).end(); return; }
      try {
        const body = await readFile(resolve(directory, path));
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
        res.end(body);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      executablePath: process.env.PRINT_CHROMIUM_PATH || '/repl/tools/bin/chromium',
      headless: true, args: ['--no-sandbox'],
    });

    async function scenario(name, mode, run, { holdLoad = false, responseStatus = 200 } = {}) {
      await t.test(name, async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [], requests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        try {
          // Deny every non-fixture URL; unexpected APIs fail the test, not just
          // the request. No auth, real user data, live server or secrets.
          await context.route('**/*', async (route) => {
            const url = new URL(route.request().url());
            if (url.origin === origin && /^\/api\/cases\/\d+\/preparation-summary$/.test(url.pathname)) {
              requests.push(url.pathname);
              return route.fulfill({ status: responseStatus, contentType: 'text/html',
                body: await page.evaluate(() => window.summaryFixture.html) });
            }
            if (url.origin === origin && (url.pathname === '/' || url.pathname.startsWith('/assets/'))) return route.continue();
            errors.push(`Unexpected network request: ${url.origin}${url.pathname}`);
            return route.abort();
          });
          // body exists when the fixture script starts, unlike addInitScript.
          await page.goto(origin);
          await page.getByTestId('button-print-summary').waitFor();
          await page.evaluate(installPrintProbe);
          await page.evaluate(({ mode, holdLoad }) => Object.assign(window.printProbe, { mode, holdLoad }), { mode, holdLoad });
          await page.getByTestId('button-print-summary').click();
          await run(page);
          assert.deepEqual(requests, ['/api/cases/1/preparation-summary']);
          assert.deepEqual(errors, responseStatus === 200 ? [] : [
            `Failed to load resource: the server responded with a status of ${responseStatus} (Internal Server Error)`,
          ]);
        } finally { await context.close(); }
      });
    }

    await scenario('native print runs once after srcdoc is ready; afterprint cleans up', 'native', async (page) => {
      await until(page, () => window.printProbe.calls.length === 1);
      await until(page, () => window.printProbe.frames[0].nativeBeforeprint);
      assert.equal(await page.evaluate(() => window.printProbe.frames[0].beforeprint), 1,
        'the original native print must actually enter the browser print lifecycle');
      // Headless Chromium may not open a visible dialog or emit afterprint.
      // The native boundary above is real; dialog-close disposal is dispatched.
      await page.evaluate(() => window.printProbe.frames[0].frame.contentWindow?.dispatchEvent(new Event('afterprint')));
      await clean(page);
      const [call] = await page.evaluate(() => window.printProbe.calls);
      assert.equal(call.ready, 'complete');
      assert.equal(call.loaded, true);
      assert.equal(call.sandbox, false, 'Chromium native print must not be sandbox-blocked');
      assert.equal(call.csp, "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        'preserve the server CSP; scripts/network inherit default-src none');
      assert.equal(call.images, 0, 'company HTML must remain escaped text');
      assert.ok(call.text.includes(await page.evaluate(() => window.summaryFixture.companyName)));
      assert.equal(await page.evaluate(() => window.__injected), undefined);
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.evaluate(() => window.printProbe.frames[0].frame.dispatchEvent(new Event('load')));
      assert.equal(await page.evaluate(() => window.printProbe.calls.length), 1);
    });

    for (const mode of ['throw', 'missing-window']) {
      await scenario(`${mode}: native-print failure uses the print-specific recovery message`, mode, async (page) => {
        await page.getByRole('alert').waitFor();
        assert.equal(await page.getByRole('alert').textContent(), printError);
        await clean(page);
        assert.equal(await page.getByTestId('button-print-summary').isEnabled(), true);
        assert.equal(await page.evaluate(() => window.printProbe.calls.length), mode === 'throw' ? 1 : 0);
      });
    }

    for (const action of ['afterprint', 'caseId', 'unmount', 'timeout']) {
      await scenario(`${action} removes the frame, listener and cleanup timer`, 'hold', async (page) => {
        await until(page, () => window.printProbe.calls.length === 1);
        assert.equal(await page.locator('iframe').count(), 1);
        assert.equal(await page.evaluate(() => window.printProbe.timers.size), 1);
        await page.evaluate(() => window.printProbe.frames[0].frame.dispatchEvent(new Event('load')));
        assert.equal(await page.evaluate(() => window.printProbe.calls.length), 1, 'repeated load cannot print again');
        if (action === 'caseId') await page.getByText('Ganti kasus', { exact: true }).click();
        else if (action === 'unmount') await page.getByText('Lepas komponen', { exact: true }).click();
        else await page.evaluate((action) => {
          if (action === 'afterprint') window.printProbe.frames[0].frame.contentWindow.dispatchEvent(new Event('afterprint'));
          else [...window.printProbe.timers.values()][0]();
        }, action);
        await clean(page);
        // A callback already queued before disposal must also be harmless.
        await page.evaluate(() => window.printProbe.frames[0].load(new Event('load')));
        assert.equal(await page.evaluate(() => window.printProbe.calls.length), 1);
        assert.equal(await page.getByRole('alert').count(), 0);
      });
    }

    for (const action of ['caseId', 'unmount']) {
      await scenario(`${action} before readiness prevents a late load from printing`, 'hold', async (page) => {
        await until(page, () => window.printProbe.frames[0]?.loaded);
        assert.equal(await page.evaluate(() => window.printProbe.calls.length), 0);
        await page.getByText(action === 'caseId' ? 'Ganti kasus' : 'Lepas komponen', { exact: true }).click();
        await clean(page);
        await page.evaluate(() => window.printProbe.frames[0].load(new Event('load')));
        assert.equal(await page.evaluate(() => window.printProbe.calls.length), 0);
      }, { holdLoad: true });
    }

    await scenario('summary request failure never creates a print surface and uses its distinct message', 'native', async (page) => {
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByRole('alert').textContent(), readError);
      assert.deepEqual(await page.evaluate(() => ({
        frames: window.printProbe.frames.length, calls: window.printProbe.calls.length, timers: window.printProbe.timers.size,
      })), { frames: 0, calls: 0, timers: 0 });
    }, { responseStatus: 500 });
    t.diagnostic(`Native Chromium ${browser.version()}; synthetic HTML/API only; no login or application data.`);
  } finally {
    await browser?.close();
    if (server) await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  }
});
