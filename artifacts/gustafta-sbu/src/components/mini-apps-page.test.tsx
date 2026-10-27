import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { Router } from 'wouter';

test('mini apps: search, filters, calendar, manual actions and download work without network', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const before = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const win = new HappyWindow({ url: 'http://localhost/mini-apps' });
  g.window = win as unknown as Window & typeof globalThis;
  g.document = win.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  let requests = 0;
  g.fetch = async () => { requests++; throw new Error('No external requests allowed'); };
  const rootDir = fileURLToPath(new URL('../../', import.meta.url));
  const server = await createServer({
    configFile: false, root: rootDir, appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': path.join(rootDir, 'src') }, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic' },
  });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const find = (id: string) => container.querySelector(`[data-testid="${id}"]`);
  const node = (id: string) => { const n = find(id); assert.ok(n, id); return n; };
  const click = (id: string) => act(async () => { (node(id) as unknown as HTMLButtonElement).click(); });
  const input = (id: string, value: string) => act(async () => {
    const n = node(id);
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(n, value);
    n.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const anchorClick = win.HTMLAnchorElement.prototype.click;
  let blob: Blob | undefined;
  let filename = '';
  let revoked = '';
  URL.createObjectURL = value => { blob = value as Blob; return 'blob:mini-app-test'; };
  URL.revokeObjectURL = value => { revoked = value; };
  win.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  try {
    const { default: Page } = await server.ssrLoadModule('/src/components/mini-apps-page.tsx');
    const render = () => act(async () => root.render(React.createElement(Router, {
      hook: () => ['/mini-apps', () => {}] as [string, (location: string) => void],
      children: React.createElement(Page),
    })));
    await render();
    assert.equal(container.querySelectorAll('[data-testid^="link-mini-"]').length, 11);
    for (const [id, href] of [['simulator', '/simulator'], ['cases', '/cases'], ['smap', '/cases'], ['documents', '/documents'], ['personnel', '/personnel'], ['regulations', '/regulations']]) {
      assert.equal(node(`link-mini-${id}`).getAttribute('href'), href);
    }
    await click('filter-bukti');
    assert.ok(find('link-mini-documents'));
    assert.equal(find('link-mini-simulator'), null);
    await input('input-mini-search', 'tidak ditemukan xyz');
    assert.ok(find('empty-mini'));
    await input('input-mini-search', '');
    await click('filter-semua');
    await input('input-expiry-asof', '2028-02-28');
    await input('input-expiry-date', '2028-03-01');
    assert.match(node('text-expiry-result').textContent!, /2 hari kalender/);
    await input('input-expiry-date', '2028-02-28');
    assert.match(node('text-expiry-result').textContent!, /sama dengan tanggal acuan/);
    await input('input-expiry-date', '2028-02-27');
    assert.match(node('text-expiry-result').textContent!, /lewat 1 hari/);
    await input('input-expiry-date', '');
    assert.doesNotMatch(node('text-expiry-result').textContent!, /lewat 1 hari/);

    assert.match(node('text-tracker-warning').textContent!, /Draf tidak disimpan/);
    await click('button-save-action');
    assert.ok(find('empty-tracker'));
    await input('input-action-title', 'Tinjau SKK 工程');
    await input('input-action-responsible', 'Tim teknik');
    await input('input-action-due', '2026-12-01');
    await click('button-save-action');
    assert.match(node('row-action-a1').textContent!, /Tinjau SKK 工程/);
    await click('button-toggle-a1');
    assert.match(node('text-tracker-progress').textContent!, /1\/1 selesai/);
    await click('button-edit-a1');
    await input('input-action-title', 'Periksa ulang SKK');
    await click('button-save-action');
    assert.equal(container.querySelectorAll('[data-testid^="row-action-"]').length, 1);
    assert.match(node('row-action-a1').textContent!, /Periksa ulang SKK/);
    await click('button-download-actions');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(filename, 'rencana-tindakan-sbu.txt');
    assert.ok(blob);
    assert.match(await blob.text(), /Periksa ulang SKK/);
    assert.match(await blob.text(), /DRAF INTERNAL/);
    assert.equal(revoked, 'blob:mini-app-test');
    assert.equal(win.document.querySelector('a[download]'), null);
    await click('button-delete-a1');
    assert.ok(find('row-action-a1'));
    await click('button-confirm-delete-a1');
    assert.ok(find('empty-tracker'));
    assert.equal((node('button-download-actions') as unknown as HTMLButtonElement).disabled, true);
    // identity consistency
    assert.match(node('text-identity-warning').textContent!, /tidak disimpan/);
    await click('button-compare-identity');
    assert.ok(find('text-identity-nothing'));
    assert.equal(find('text-identity-consistent'), null);
    await input('input-identity-label-0', 'Akta');
    assert.equal(find('result-identity'), null, 'input clears stale result');
    for (const i of [0, 1]) { await input(`input-identity-companyName-${i}`, 'PT Bangun Raya'); await input(`input-identity-nib-${i}`, '1234567890123'); await input(`input-identity-npwp-${i}`, '01.234.567.8-901.000'); }
    await click('button-compare-identity');
    assert.ok(find('text-identity-consistent'));
    await input('input-identity-npwp-1', '0012345678901000');
    await input('input-identity-nib-1', '12345');
    await click('button-compare-identity');
    assert.ok(find('text-identity-npwp-length'));
    assert.match(node('result-identity').textContent!, /Akta, Berkas 2/);
    assert.match(node('result-identity').textContent!, /bukan bukti NIB terdaftar/);
    await click('button-add-identity');
    assert.equal(find('result-identity'), null);
    assert.ok(find('input-identity-nib-2'));
    await click('button-remove-identity-2');
    assert.equal(find('input-identity-nib-2'), null);
    await click('button-reset-identity');
    assert.equal((node('input-identity-label-0') as unknown as HTMLInputElement).value, '');
    assert.equal(requests, 0);
    await act(async () => root.render(null));
    await render();
    assert.ok(find('empty-tracker'), 'draft is not persisted after unmount');
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await win.happyDOM.close();
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
    win.HTMLAnchorElement.prototype.click = anchorClick;
    g.window = before.window; g.document = before.document; g.fetch = before.fetch;
    g.IS_REACT_ACT_ENVIRONMENT = before.act;
  }
});
