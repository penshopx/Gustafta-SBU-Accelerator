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
import { installDownloadProbe } from './download-probe.mjs';

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

test('CasePreparationExport disposes isolated native print surfaces and HTML download URLs', { timeout: 120_000 }, async (t) => {
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

    async function scenario(name, mode, run, {
      holdLoad = false, responseStatus = 200, exportMode = 'print',
      failDownloadClick = false,
      expectedRequests = ['/api/cases/1/preparation-summary'],
      expectedConsoleErrors = [],
    } = {}) {
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
          if (exportMode === 'download') {
            await page.evaluate(installDownloadProbe);
            await page.evaluate((fail) => { window.downloadProbe.failClick = fail; }, failDownloadClick);
          }
          else {
            await page.evaluate(installPrintProbe);
            await page.evaluate(({ mode, holdLoad }) => Object.assign(window.printProbe, { mode, holdLoad }), { mode, holdLoad });
          }
          await page.getByTestId(`button-${exportMode}-summary`).click();
          await run(page);
          assert.deepEqual(requests, expectedRequests);
          assert.deepEqual(errors, responseStatus === 200 ? expectedConsoleErrors : [
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

    async function assertDownload(page, index = 0) {
      await until(page, () => window.downloadProbe.timers.size === 1);
      await page.getByTestId('button-download-summary').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('button-download-summary').isEnabled(), true);
      const record = await page.evaluate(async (index) => {
        const probe = window.downloadProbe;
        const { blob, url } = probe.blobs[index];
        return {
          isBlob: blob instanceof Blob, type: blob.type, text: await blob.text(),
          expected: window.summaryFixture.html, url, click: probe.clicks[index],
          created: probe.blobs.length, clicks: probe.clicks.length,
          active: [...probe.active], timers: probe.timers.size,
        };
      }, index);
      assert.equal(record.isBlob, true);
      assert.equal(record.type, 'text/html;charset=utf-8');
      assert.match(record.text, /Checklist SMAP — deklarasi dan telaah internal/);
      assert.match(record.text, /Deklarasi SMAP &lt;script&gt;uji&lt;\/script&gt;/);
      assert.match(record.text, /synthetic-reviewer/);
      assert.match(record.text, /PERLU DITINJAU ULANG/);
      assert.match(record.text, /Dokumen SMAP &lt;contoh&gt;/);
      assert.equal((record.text.match(/<h3>SMC-/g) ?? []).length, 23);
      assert.equal(record.text, record.expected);
      assert.ok(record.url.startsWith('blob:'));
      assert.deepEqual(record.click, { href: record.url, download: 'ringkasan-persiapan-sbu.html' });
      assert.equal(record.created, index + 1);
      assert.equal(record.clicks, index + 1);
      assert.deepEqual(record.active, [record.url]);
      assert.equal(record.timers, 1);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.getByRole('alert').count(), 0);
      // This resolves the real browser-created URL, not a probe-only value.
      assert.equal(await page.evaluate(async (url) => (await fetch(url)).text(), record.url), record.expected);
      return record.url;
    }

    async function assertDownloadClean(page, urls) {
      await until(page, () => window.downloadProbe.active.size === 0 && window.downloadProbe.timers.size === 0);
      const revoked = await page.evaluate(() => window.downloadProbe.revoked);
      for (const url of urls) {
        assert.ok(revoked.includes(url), `must revoke ${url}`);
        assert.equal(await page.evaluate(async (url) => {
          try { await fetch(url); return false; } catch { return true; }
        }, url), true, 'revoked native URL must no longer resolve');
      }
    }

    for (const action of ['timeout', 'caseId', 'unmount', 'next-export']) {
      await scenario(`download: ${action} releases the HTML Blob URL and cleanup timer`, 'native', async (page) => {
        // All native clicks are recorded; also inspect the actual file emitted
        // by the browser on the subsequent download.
        const first = await assertDownload(page);
        const urls = [first];
        if (action === 'timeout') {
          await page.evaluate(() => [...window.downloadProbe.timers.values()][0]());
        } else if (action === 'next-export') {
          const downloadEvent = page.waitForEvent('download');
          await page.getByTestId('button-download-summary').click();
          const download = await downloadEvent;
          assert.equal(download.suggestedFilename(), 'ringkasan-persiapan-sbu.html');
          const second = await assertDownload(page, 1);
          assert.notEqual(second, first, 'each export gets a fresh native URL');
          assert.deepEqual(await page.evaluate(() => window.downloadProbe.revoked), [first]);
          assert.equal(await readFile(await download.path(), 'utf8'),
            await page.evaluate(() => window.summaryFixture.html), 'native anchor downloads the complete HTML');
          urls.push(second);
          await page.getByText('Lepas komponen', { exact: true }).click();
        } else {
          await page.getByText(action === 'caseId' ? 'Ganti kasus' : 'Lepas komponen', { exact: true }).click();
        }
        await assertDownloadClean(page, urls);
      }, {
        exportMode: 'download',
        // Reading each revoked native URL deliberately fails. Require exactly
        // these diagnostics, rather than ignoring arbitrary console errors.
        expectedConsoleErrors: Array(action === 'next-export' ? 2 : 1)
          .fill('Failed to load resource: net::ERR_FILE_NOT_FOUND'),
        expectedRequests: action === 'next-export'
          ? ['/api/cases/1/preparation-summary', '/api/cases/1/preparation-summary']
          : ['/api/cases/1/preparation-summary'],
      });
    }

    await scenario('download: thrown anchor click releases its URL and timer immediately; retry succeeds', 'native', async (page) => {
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByRole('alert').textContent(), readError);
      assert.equal(await page.getByTestId('button-download-summary').isEnabled(), true);
      assert.equal(await page.getByTestId('button-print-summary').isEnabled(), true);
      const first = await page.evaluate(() => window.downloadProbe.blobs[0].url);
      assert.deepEqual(await page.evaluate(() => ({
        blobs: window.downloadProbe.blobs.length, clicks: window.downloadProbe.clicks.length,
        timers: window.downloadProbe.timers.size, active: [...window.downloadProbe.active],
        revoked: window.downloadProbe.revoked,
      })), { blobs: 1, clicks: 1, timers: 0, active: [], revoked: [first] });
      assert.equal(await page.locator('iframe').count(), 0);
      await assertDownloadClean(page, [first]);

      await page.evaluate(() => { window.downloadProbe.failClick = false; });
      const downloadEvent = page.waitForEvent('download');
      await page.getByTestId('button-download-summary').click();
      const download = await downloadEvent;
      const second = await assertDownload(page, 1);
      assert.equal(download.suggestedFilename(), 'ringkasan-persiapan-sbu.html');
      assert.equal(await readFile(await download.path(), 'utf8'),
        await page.evaluate(() => window.summaryFixture.html));
      assert.notEqual(first, second);
      await page.evaluate(() => [...window.downloadProbe.timers.values()][0]());
      await assertDownloadClean(page, [second]);
      await page.getByText('Lepas komponen', { exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.downloadProbe.revoked), [first, second],
        'failure, timeout and unmount must each dispose only their own live resource once');
    }, {
      exportMode: 'download', failDownloadClick: true,
      expectedRequests: ['/api/cases/1/preparation-summary', '/api/cases/1/preparation-summary'],
      expectedConsoleErrors: Array(2).fill('Failed to load resource: net::ERR_FILE_NOT_FOUND'),
    });

    await scenario('download: failed summary creates no Blob URL, anchor click or cleanup timer', 'native', async (page) => {
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByRole('alert').textContent(), readError);
      assert.deepEqual(await page.evaluate(() => ({
        blobs: window.downloadProbe.blobs.length, clicks: window.downloadProbe.clicks.length,
        timers: window.downloadProbe.timers.size, active: window.downloadProbe.active.size,
        revoked: window.downloadProbe.revoked,
      })), { blobs: 0, clicks: 0, timers: 0, active: 0, revoked: [] });
      assert.equal(await page.getByTestId('button-download-summary').isEnabled(), true);
    }, { exportMode: 'download', responseStatus: 500 });
    t.diagnostic(`Native Chromium ${browser.version()}; synthetic HTML/API only; no login or application data.`);
  } finally {
    await browser?.close();
    if (server) await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  }
});
