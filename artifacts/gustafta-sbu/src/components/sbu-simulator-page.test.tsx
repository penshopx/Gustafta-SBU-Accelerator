import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { Router } from 'wouter';

test('simulator lokal: validasi, empat langkah, hitung ulang, unduh, reset, dan jalur perpanjangan', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const window = new HappyWindow({ url: 'http://localhost/simulator' });
  g.window = window as unknown as Window & typeof globalThis;
  g.document = window.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  let networkRequests = 0;
  g.fetch = async () => { networkRequests++; throw new Error('Simulator tidak boleh mengirim data'); };
  const { createRoot } = await import('react-dom/client');
  const rootDir = fileURLToPath(new URL('../../', import.meta.url));
  const server = await createServer({
    configFile: false, root: rootDir, appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': path.join(rootDir, 'src') }, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic' },
  });
  const container = window.document.createElement('div');
  window.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const byId = (id: string) => {
    const node = container.querySelector(`[data-testid="${id}"]`);
    assert.ok(node, `elemen ${id} tersedia`);
    return node;
  };
  const click = async (id: string) => act(async () => { (byId(id) as unknown as HTMLButtonElement).click(); });
  const input = async (id: string, value: string) => act(async () => {
    const node = byId(id);
    const prototype = node.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  try {
    const { default: Simulator } = await server.ssrLoadModule('/src/components/sbu-simulator-page.tsx');
    await act(async () => root.render(React.createElement(Router, {
      hook: () => ['/simulator', () => {}] as [string, (path: string) => void],
      children: React.createElement(Simulator),
    })));
    assert.match(byId('text-simulator-privacy').textContent!, /Tidak diunggah/);
    await click('button-next');
    assert.match(byId('text-step-errors').textContent!, /nama badan usaha/);
    await click('button-load-example');
    await click('button-next');
    assert.ok(byId('group-area-personel'));
    assert.equal(container.querySelector('[data-testid="group-area-sbu_lama"]'), null);
    await act(async () => {
      const select = byId('select-status-peralatan') as unknown as HTMLSelectElement;
      select.value = 'tidak_relevan';
      select.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    await click('button-next');
    assert.match(byId('text-step-errors').textContent!, /alasan tidak relevan/);
    await input('input-note-peralatan', 'DATA CONTOH: perlu dikonfirmasi penelaah.');
    await click('button-next');
    await click('button-next');
    assert.match(byId('text-step-errors').textContent!, /Centang/);
    await click('checkbox-acknowledge');
    await click('button-next');
    assert.match(byId('text-result-status').textContent!, /belum lengkap/);
    assert.ok(byId('finding-cakupan-aturan'));
    assert.match(byId('text-coverage').textContent!, /dari 6 area/);
    const oldStatus = byId('text-count-conflict').textContent;
    await click('button-edit-answers');
    await input('input-sim-company', 'PT Nama Berbeda');
    await click('button-next');
    await click('button-next');
    await click('button-next');
    assert.notEqual(byId('text-count-conflict').textContent, oldStatus, 'hasil lama dihitung ulang');
    assert.ok(byId('finding-legalitas-nama'));

    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
    const originalClick = window.HTMLAnchorElement.prototype.click;
    let saved: Blob | undefined;
    let downloads = 0;
    URL.createObjectURL = blob => { saved = blob as Blob; return 'blob:simulator-fixture'; };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { downloads++; };
    try {
      await click('button-download-report');
      assert.equal(downloads, 1);
      assert.match(await saved!.text(), /bukan verifikasi berkas asli/);
      await new Promise(resolve => setTimeout(resolve, 10));
    } finally {
      URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
      window.HTMLAnchorElement.prototype.click = originalClick;
    }
    await click('button-reset');
    await click('button-cancel-reset');
    assert.ok(byId('text-result-status'));
    await click('button-reset');
    await click('button-confirm-reset');
    assert.equal((byId('input-sim-company') as unknown as HTMLInputElement).value, '');
    assert.equal(container.querySelector('[data-testid="badge-example"]'), null);
    await click('button-load-example');
    await click('radio-jenis-permohonan-perpanjangan');
    await click('button-next');
    assert.match(byId('text-step-errors').textContent!, /nomor SBU/);
    await input('input-sim-old-number', 'CONTOH-SBU-01');
    await input('input-sim-old-date', '2028-02-29');
    await click('button-next');
    assert.ok(byId('group-area-sbu_lama'));
    assert.equal(networkRequests, 0);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await window.happyDOM.abort();
    g.window = previous.window; g.document = previous.document; g.fetch = previous.fetch;
    g.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
