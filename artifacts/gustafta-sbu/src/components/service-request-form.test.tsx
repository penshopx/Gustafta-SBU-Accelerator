import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';

test('service form: validate, review, edit, explicit WhatsApp link, no persistence', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const before = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const win = new HappyWindow({ url: 'http://localhost/' });
  g.window = win as unknown as Window & typeof globalThis;
  g.document = win.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  let fetches = 0;
  g.fetch = (async () => { fetches++; throw new Error('no network'); }) as typeof fetch;
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
  const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as unknown as HTMLElement | null;
  const type = async (id: string, v: string) => act(async () => {
    const el = find(id) as unknown as HTMLInputElement;
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event);
  });
  const click = async (id: string) => act(async () => { find(id)!.click(); });
  const submit = async () => act(async () => { find('form-service-request')!.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event); });
  try {
    const { ServiceRequestForm } = await server.ssrLoadModule('/src/components/landing/service-request-form.tsx');
    await act(async () => root.render(React.createElement(ServiceRequestForm)));
    assert.equal(find('check-consent')?.hasAttribute('required'), true);
    assert.equal((find('check-consent') as unknown as HTMLInputElement).checked, false);
    assert.equal(find('input-name')?.hasAttribute('required'), true);
    assert.equal(find('link-open-whatsapp'), null, 'no outbound link before review');
    await submit();
    assert.ok(find('summary-service-errors'));
    assert.equal(win.document.activeElement, find('summary-service-errors'));
    assert.ok(find('error-consent')); assert.ok(find('error-help'));
    await type('input-name', 'Rina <b>x</b>'); await type('input-company', 'CV Tirta Bangun');
    await type('input-phone', '0812 34ab 7890'); await type('input-location', 'Bekasi');
    await click('radio-app-perpanjangan'); await click('check-help-smap'); await click('check-consent');
    await submit();
    assert.ok(find('error-phone'), 'letters rejected');
    await type('input-phone', '+62 812-3456-7890');
    await submit();
    const summary = find('text-service-summary')!;
    assert.match(summary.textContent!, /Nama kontak: Rina <b>x<\/b>/);
    assert.equal(summary.querySelector('b'), null, 'escaped plain text');
    const link = find('link-open-whatsapp') as unknown as HTMLAnchorElement;
    const url = new URL(link.getAttribute('href')!);
    assert.equal(url.host, 'wa.me'); assert.equal(url.pathname, '/6281287941900');
    assert.equal(url.searchParams.get('text'), summary.textContent);
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    assert.match(container.textContent!, /Belum ada yang terkirim/);
    assert.doesNotMatch(container.textContent!, /berhasil dikirim|terkirim\./i);
    await click('button-edit-service');
    assert.equal(find('link-open-whatsapp'), null, 'no stale link while editing');
    assert.equal(win.document.activeElement, find('input-name'));
    assert.equal((find('input-company') as unknown as HTMLInputElement).value, 'CV Tirta Bangun');
    assert.equal((find('check-consent') as unknown as HTMLInputElement).checked, true);
    await type('input-company', 'PT Baru Jaya');
    await submit();
    assert.match(find('text-service-summary')!.textContent!, /Badan usaha: PT Baru Jaya/);
    assert.match(new URL(find('link-open-whatsapp')!.getAttribute('href')!).searchParams.get('text')!, /PT Baru Jaya/);
    assert.equal(container.querySelector('iframe'), null);
    assert.equal(fetches, 0);
    assert.equal(win.localStorage.length, 0); assert.equal(win.sessionStorage.length, 0);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await win.happyDOM.close();
    g.window = before.window; g.document = before.document; g.fetch = before.fetch;
    g.IS_REACT_ACT_ENVIRONMENT = before.act;
  }
});
