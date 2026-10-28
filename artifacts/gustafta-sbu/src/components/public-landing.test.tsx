import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { Router } from 'wouter';

test('landing: renders honest copy, working CTAs, and mounts film only on click', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const before = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const win = new HappyWindow({ url: 'http://localhost/' });
  g.window = win as unknown as Window & typeof globalThis;
  g.document = win.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
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
  try {
    const { default: Page } = await server.ssrLoadModule('/src/components/landing/public-landing.tsx');
    await act(async () => root.render(React.createElement(Router, { hook: () => ['/', () => {}] as [string, (l: string) => void], children: React.createElement(Page) })));
    const hrefs: Record<string, string> = { 'link-sign-up': '/sign-up', 'link-start': '/sign-up', 'link-join-bottom': '/sign-up', 'link-sign-in': '/sign-in', 'link-login-hero': '/sign-in', 'link-simulator': '/simulator', 'link-mini-apps': '/mini-apps', 'link-feature-cases': '/cases', 'link-feature-documents': '/documents', 'link-feature-regulations': '/regulations', 'link-feature-assistant': '/assistant', 'link-feature-personnel': '/personnel', 'link-feature-agenda': '/agenda' };
    for (const [id, href] of Object.entries(hrefs)) assert.equal(find(id)?.getAttribute('href'), href, id);
    const text = container.textContent ?? '';
    assert.match(find('note-independence')?.textContent ?? '', /tidak terafiliasi.*LSBU/);
    for (const banned of [/\d+\s*%/, /dijamin|garansi|pasti lolos|100/i, /resmi dari|mitra resmi/i]) assert.doesNotMatch(text, banned);
    assert.match(text, /bukan jaminan/); assert.match(text, /DRAF AI/); assert.match(text, /VERIFIKASI MANUSIA/);
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}]/u, 'no emoji');
    assert.equal(container.querySelector('iframe'), null, 'film not mounted before click');
    assert.match(find('note-film-concept')?.textContent ?? '', /bukan bukti integrasi/);
    assert.equal(find('link-open-film')?.getAttribute('href'), '/gustafta-film/');
    await act(async () => { (find('button-load-film') as unknown as HTMLButtonElement).click(); });
    const frame = find('iframe-film');
    assert.ok(frame); assert.equal(frame.getAttribute('src'), '/gustafta-film/'); assert.ok(frame.getAttribute('title'));
    assert.equal(frame.getAttribute('loading'), 'lazy'); assert.ok(frame.hasAttribute('allowfullscreen'));
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await win.happyDOM.close();
    g.window = before.window; g.document = before.document; g.fetch = before.fetch;
    g.IS_REACT_ACT_ENVIRONMENT = before.act;
  }
});
