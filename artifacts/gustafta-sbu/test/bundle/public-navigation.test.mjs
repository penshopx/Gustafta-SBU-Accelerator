import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';

// Built public routes only: no sign-in, synthetic account or paid API call.
test('built routes load on demand and recover from a missing feature chunk', async () => {
  const server = await preview({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    build: { outDir: 'dist/public' },
    preview: { host: '127.0.0.1', port: 0, open: false },
  });
  let browser;
  try {
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({
      executablePath: process.env.PRINT_CHROMIUM_PATH || '/repl/tools/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.resourceType() === 'script') requests.push(request.url());
    });
    // Public simulator bypasses Clerk. Test the emitted chunks, not Vite's
    // development module graph, without reaching any external service.
    await page.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    await page.goto(`${origin}/simulator`);
    await page.locator('h1').waitFor();
    assert.ok(requests.some(url => /sbu-simulator-page-.*\.js/.test(url)));
    for (const name of ['sbu-chat-page', 'personnel-page', 'document-vault-page', 'mini-apps-page']) {
      assert.ok(!requests.some(url => url.includes(`${name}-`)), `${name} fetched too early`);
    }
    assert.ok(!requests.some(url => /\/help-desk-[^/]+\.js/.test(url)), 'support chunk fetched before interaction');
    let releaseHelp;
    const helpGate = new Promise(resolve => { releaseHelp = resolve; });
    await page.route('**/assets/help-desk-*.js', async route => {
      await helpGate;
      await route.continue();
    });
    await page.getByTestId('help-desk-trigger').click();
    await page.getByRole('button', { name: 'Batalkan pemuatan Help Desk' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Buka Help Desk, pemandu aplikasi' }).waitFor();
    const helpResponse = page.waitForResponse(response => /\/help-desk-[^/]+\.js/.test(response.url()));
    releaseHelp();
    await helpResponse;
    assert.equal(await page.getByRole('dialog').count(), 0, 'late module must not reopen cancelled help');
    await page.getByTestId('help-desk-trigger').click();
    await page.getByRole('dialog').waitFor();
    await page.getByTestId('help-desk-input').fill('Bagaimana cara membuat kasus SBU?');
    await page.getByTestId('help-desk-send').click();
    await page.locator('[data-testid^="help-desk-answer-"]').waitFor();
    await page.getByTestId('help-desk-input').fill('draf contoh belum dikirim');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.getByTestId('help-desk-trigger').evaluate(element => element === document.activeElement), true);
    await page.getByTestId('help-desk-trigger').click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('[data-testid^="help-desk-answer-"]').count(), 1);
    assert.equal(await page.getByTestId('help-desk-input').inputValue(), 'draf contoh belum dikirim');
    await page.getByTestId('help-desk-close').click();

    await page.goto(`${origin}/mini-apps`);
    await page.locator('h1').waitFor();
    assert.ok(requests.some(url => /mini-apps-page-.*\.js/.test(url)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // Native date inputs must not impose their intrinsic width on implicit
    // grid tracks. Check the whole page and the actual controls, not clipping.
    for (const width of [320, 360, 390, 402, 768, 1280]) {
      await page.setViewportSize({ width, height: 874 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `Mini Apps overflows at ${width}px`,
      );
      for (const name of ['input-expiry-date', 'input-expiry-asof', 'input-backup-actions']) {
        const bounds = await page.getByTestId(name).boundingBox();
        assert.ok(bounds && bounds.width > 100 && bounds.x >= 0 && bounds.x + bounds.width <= width,
          `${name} must remain inside the ${width}px viewport`);
      }
      const calculator = await page.getByTestId('tool-expiry').boundingBox();
      const tracker = await page.getByTestId('tool-tracker').boundingBox();
      assert.ok(calculator && tracker);
      if (width < 1024) {
        assert.ok(tracker.y >= calculator.y + calculator.height, 'tools stack on narrow screens');
      } else {
        assert.ok(tracker.x >= calculator.x + calculator.width, 'tools remain side by side on desktop');
        assert.equal(tracker.y, calculator.y);
      }
    }
    await page.setViewportSize({ width: 402, height: 874 });
    await page.getByTestId('input-expiry-asof').fill('2026-11-01');
    await page.getByTestId('input-expiry-date').fill('2026-11-30');
    assert.match(await page.getByTestId('text-expiry-result').textContent(),
      /29 hari kalender lagi menuju tanggal berakhir SBU/);
    await page.getByTestId('radio-expiry-skk').click();
    assert.equal(await page.getByTestId('radio-expiry-skk').getAttribute('aria-checked'), 'true');
    assert.match(await page.getByTestId('text-expiry-result').textContent(),
      /29 hari kalender lagi menuju tanggal berakhir SKK/);
    await page.getByTestId('input-expiry-date').fill('2026-10-31');
    assert.match(await page.getByTestId('text-expiry-result').textContent(),
      /SKK sudah lewat 1 hari kalender/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);

    // Fresh page, missing module; explicit retry should fetch the module again.
    const recovery = await browser.newPage();
    recovery.setDefaultTimeout(10000);
    let failed = false;
    await recovery.route('**/*', route => {
      const url = route.request().url();
      if (/sbu-simulator-page-.*\.js/.test(url) && !failed) {
        failed = true;
        return route.abort();
      }
      return new URL(url).origin === origin ? route.continue() : route.abort();
    });
    await recovery.goto(`${origin}/simulator`);
    await recovery.getByRole('heading', { name: 'Fitur belum dapat dimuat' }).waitFor();
    assert.ok(failed);
    await Promise.all([
      recovery.waitForEvent('load'),
      recovery.getByRole('button', { name: 'Coba muat fitur lagi' }).click(),
    ]);
    await recovery.locator('h1').waitFor();
    assert.equal(await recovery.getByRole('heading', { name: 'Fitur belum dapat dimuat' }).count(), 0);

    const supportRecovery = await browser.newPage();
    supportRecovery.setDefaultTimeout(10000);
    let supportFailed = false;
    await supportRecovery.route('**/*', route => {
      const url = route.request().url();
      if (/\/help-desk-[^/]+\.js/.test(url) && !supportFailed) {
        supportFailed = true;
        return route.abort();
      }
      return new URL(url).origin === origin ? route.continue() : route.abort();
    });
    await supportRecovery.goto(`${origin}/mini-apps`);
    await supportRecovery.getByTestId('help-desk-trigger').click();
    await supportRecovery.getByRole('heading', { name: 'Bantuan belum dapat dimuat' }).waitFor();
    assert.ok(supportFailed);
    assert.match(await supportRecovery.getByRole('alert').textContent(), /isian yang belum disimpan/);
    await supportRecovery.getByRole('button', { name: 'Tutup', exact: true }).click();
    await supportRecovery.getByTestId('help-desk-trigger').waitFor();
    assert.equal(await supportRecovery.locator('h1').isVisible(), true, 'support failure leaves the main page usable');
    await supportRecovery.getByTestId('help-desk-trigger').click();
    await supportRecovery.getByRole('button', { name: 'Muat ulang halaman', exact: true }).waitFor();
    await Promise.all([
      supportRecovery.waitForEvent('load'),
      supportRecovery.getByRole('button', { name: 'Muat ulang halaman', exact: true }).click(),
    ]);
    await supportRecovery.getByTestId('help-desk-trigger').click();
    await supportRecovery.getByRole('dialog').waitFor();
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
