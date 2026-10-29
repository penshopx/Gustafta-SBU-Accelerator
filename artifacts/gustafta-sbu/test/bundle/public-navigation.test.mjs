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
    await page.getByTestId('help-desk-trigger').click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);

    await page.goto(`${origin}/mini-apps`);
    await page.locator('h1').waitFor();
    assert.ok(requests.some(url => /mini-apps-page-.*\.js/.test(url)));
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
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
