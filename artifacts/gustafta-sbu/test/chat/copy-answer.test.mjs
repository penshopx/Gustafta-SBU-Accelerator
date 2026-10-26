import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';

const root = dirname(fileURLToPath(import.meta.url));
const owner = 'synthetic-chat-owner';
const notice = 'Fixture: ringkasan publik terkurasi, bukan verifikasi live atau nasihat hukum.';
const emptyNotice = 'Fixture baru: tidak ditemukan sumber yang dapat dirujuk.';
const emptyWarning = 'Tidak ada kutipan sumber yang digunakan. Rujukan spesifik belum terverifikasi.';
const sources = [
  {
    id: 'fixture-metadata', document: 'Dokumen sintetis metadata A', version: 'Versi fixture 2026-A',
    locator: 'Metadata penerbit — bagian status', verificationStatus: 'verified',
    verificationScope: 'Hanya metadata penerbit, bukan isi pasal.',
    documentStatus: 'Berlaku saat pemeriksaan fixture; bukan konfirmasi terkini.',
    excerpt: 'Ringkasan metadata sintetis, bukan kutipan verbatim.',
    limitation: 'Tidak memverifikasi isi lampiran maupun perubahan setelah pemeriksaan.',
    checkedOn: '2026-09-26', sourceUrl: 'https://example.invalid/metadata-a',
  },
  {
    id: 'fixture-unverified', document: 'Dokumen sintetis lampiran B', version: 'Versi fixture 2026-B',
    locator: 'Lampiran II — PDF hlm. 42', verificationStatus: 'unverified',
    verificationScope: 'Ringkasan salinan belum diperiksa ke penerbit.',
    documentStatus: 'Status berlaku belum dikonfirmasi.',
    excerpt: 'Ringkasan lampiran sintetis untuk pengujian saja.',
    limitation: 'Jangan gunakan sebagai dasar keputusan sebelum memeriksa sumber primer.',
    checkedOn: '2026-09-27', sourceUrl: 'https://example.invalid/lampiran-b',
  },
];
const quota = {
  userId: owner, dailyLimit: 30, dailyRemaining: 29, minuteLimit: 6, minuteRemaining: 5,
  dailyResetAt: '2026-10-21T00:00:00Z', minuteResetAt: '2026-10-20T12:01:00Z',
  busy: false, retryAfterSeconds: 0,
};

test('native clipboard retains source cards and verification limits across a new conversation', { timeout: 120_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sbu-chat-copy-'));
  let browser, server;
  try {
    await build({
      configFile: false, root, base: '/', logLevel: 'error',
      esbuild: { jsx: 'automatic' },
      resolve: { alias: { '@': resolve(root, '../../src') }, dedupe: ['react', 'react-dom'] },
      build: { outDir: directory, emptyOutDir: true },
    });
    server = createServer(async (req, res) => {
      const path = req.url === '/' ? 'index.html' : req.url.slice(1);
      if (!/^(index\.html|assets\/[\w.-]+)$/.test(path)) { res.writeHead(404).end(); return; }
      try {
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
        res.end(await readFile(resolve(directory, path)));
      } catch { res.writeHead(404).end(); }
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      executablePath: process.env.CHAT_CHROMIUM_PATH || '/repl/tools/bin/chromium',
      headless: true, args: ['--no-sandbox'],
    });
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [], sent = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin === origin && url.pathname === '/api/openai/sbu/specialists' && request.method() === 'GET') {
        return json([{ id: 'sbuclaw', name: 'Spesialis fixture', group: 'Sintetis',
          description: 'Katalog pengujian', prompts: ['Pertanyaan sintetis'], knowledgeStatus: 'Tidak ada data nyata.' }]);
      }
      if (url.origin === origin && url.pathname === '/api/openai/sbu/budget' && request.method() === 'GET') {
        assert.equal(request.headers()['x-sbu-form-owner'], owner);
        return json({ userId: owner, status: 'available', checkedAt: '2026-10-20T12:00:00Z', nextResetAt: null });
      }
      if (url.origin === origin && url.pathname === '/api/openai/sbu/quota' && request.method() === 'GET') {
        assert.equal(request.headers()['x-sbu-form-owner'], owner);
        return json(quota);
      }
      if (url.origin === origin && url.pathname === '/api/openai/sbu/messages' && request.method() === 'POST') {
        assert.equal(request.headers()['x-sbu-form-owner'], owner);
        const body = request.postDataJSON();
        sent.push(body);
        return json({ userId: owner, mode: body.mode, purpose: body.purpose, specialist: body.specialist, quota,
          answer: sent.length === 1 ? 'Jawaban sintetis pertama dengan dua sumber.' : 'Jawaban sintetis baru tanpa sumber.',
          citations: sent.length === 1 ? sources : [], retrievalNotice: sent.length === 1 ? notice : emptyNotice });
      }
      if (url.origin === origin && request.method() === 'GET' && (url.pathname === '/' || /^\/assets\/[\w.-]+$/.test(url.pathname))) return route.continue();
      errors.push(`Unexpected network: ${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    });
    await page.goto(origin);
    await page.getByTestId('checkbox-consent').check();
    const send = async text => {
      await page.getByTestId('input-chat-message').fill(text);
      await page.getByTestId('button-send-chat').click();
    };
    await send('Pertanyaan sintetis pertama.');
    const citations = page.getByRole('region', { name: 'Sumber jawaban' });
    await citations.waitFor();
    assert.equal(await citations.locator('article').count(), 2);
    assert.ok((await citations.innerText()).includes(notice));
    const copy = page.getByRole('button', { name: 'Salin jawaban' });
    // Read the actual browser clipboard; do not stub writeText or call the
    // formatter under test to construct expected output.
    await page.evaluate(() => navigator.clipboard.writeText('SENTINEL-BEFORE-COPY'));
    await copy.click();
    await page.waitForFunction(() => navigator.clipboard.readText().then(text => text !== 'SENTINEL-BEFORE-COPY'));
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const expected = ['Jawaban sintetis pertama dengan dua sumber.', notice];
    for (const [index, source] of sources.entries()) {
      const card = citations.locator('article').nth(index);
      const label = source.verificationStatus === 'verified' ? 'Terverifikasi terbatas' : 'Belum terverifikasi';
      const text = await card.innerText();
      for (const value of [source.document, source.version, source.locator, label, source.verificationScope,
        source.documentStatus, source.excerpt, source.limitation, source.checkedOn]) {
        assert.ok(text.includes(value), `card missing ${value}`);
        assert.ok(clipboard.includes(value), `clipboard missing ${value}`);
      }
      assert.equal(await card.getByRole('link').getAttribute('href'), source.sourceUrl);
      expected.push(`[${source.id}] ${source.document}\n${source.version}\n${source.locator}\n${label}: ${source.verificationScope}\nStatus: ${source.documentStatus}\nRingkasan: ${source.excerpt}\nBatas verifikasi: ${source.limitation}\nPemeriksaan: ${source.checkedOn}\n${source.sourceUrl}`);
    }
    assert.equal(clipboard, expected.join('\n\n'));
    await page.getByTestId('button-new-chat').click();
    await page.getByTestId('button-confirm-ok').click();
    assert.equal(await citations.count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Salin jawaban' }).count(), 0);
    await send('Pertanyaan sintetis baru.');
    await citations.waitFor();
    assert.ok((await citations.innerText()).includes(emptyNotice));
    assert.ok((await citations.innerText()).includes(emptyWarning));
    assert.equal(await citations.locator('article, a').count(), 0);
    await page.evaluate(() => navigator.clipboard.writeText('SENTINEL-NEW-CHAT'));
    await page.getByRole('button', { name: 'Salin jawaban' }).click();
    await page.waitForFunction(() => navigator.clipboard.readText().then(text => text !== 'SENTINEL-NEW-CHAT'));
    const newClipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(newClipboard, `Jawaban sintetis baru tanpa sumber.\n\n${emptyNotice}`);
    const newText = await page.getByTestId('list-chat-messages').innerText();
    for (const old of [notice, ...sources.flatMap(s => [s.id, s.document, s.locator, s.sourceUrl, s.limitation])]) {
      assert.ok(!newText.includes(old), `old source retained in UI: ${old}`);
      assert.ok(!newClipboard.includes(old), `old source retained in clipboard: ${old}`);
    }
    assert.equal(sent.length, 2);
    for (const [index, body] of sent.entries()) {
      assert.equal(body.consent, true);
      assert.equal(body.mode, 'bujk');
      assert.equal(body.specialist, 'sbuclaw');
      assert.deepEqual(body.messages, [{ role: 'user', content: index === 0 ? 'Pertanyaan sintetis pertama.' : 'Pertanyaan sintetis baru.' }]);
    }
    assert.deepEqual(errors, []);
    t.diagnostic(`Chromium ${browser.version()}; native clipboard; all APIs intercepted; no accounts, documents, database or AI calls.`);
    await context.close();
  } finally {
    await browser?.close();
    if (server) await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  }
});
