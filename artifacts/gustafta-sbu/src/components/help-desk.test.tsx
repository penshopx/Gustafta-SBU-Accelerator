import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { Router } from 'wouter';

test('help desk: memory-only guided answers, links, reset, bounded history, safe text', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const before = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const win = new HappyWindow({ url: 'http://localhost/dashboard' });
  const viewport = Object.assign(new win.EventTarget(), { height: 460, offsetTop: 0 });
  Object.defineProperty(win, 'visualViewport', { configurable: true, value: viewport });
  g.window = win as unknown as Window & typeof globalThis;
  g.document = win.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // Radix uses browser globals directly, not only window.document.
  const domKeys = ['HTMLElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver',
    'CustomEvent', 'Event', 'HTMLInputElement', 'DocumentFragment', 'ShadowRoot', 'getComputedStyle'] as const;
  const savedGlobals = domKeys.map(key => [key, Object.getOwnPropertyDescriptor(g, key)] as const);
  for (const key of domKeys) Object.defineProperty(g, key, {
    configurable: true, writable: true, value: key === 'getComputedStyle' ? win.getComputedStyle.bind(win) : win[key],
  });
  let requests = 0;
  g.fetch = async () => { requests++; throw new Error('No external requests allowed'); };
  const storageWrites: string[] = [];
  for (const s of [win.localStorage, win.sessionStorage]) {
    const orig = s.setItem.bind(s);
    s.setItem = (k: string, v: string) => { storageWrites.push(k); orig(k, v); };
  }
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
  const doc = win.document;
  const find = (id: string) => doc.querySelector(`[data-testid="${id}"]`);
  const node = (id: string) => { const n = find(id); assert.ok(n, id); return n; };
  const click = (id: string) => act(async () => { (node(id) as unknown as HTMLButtonElement).click(); });
  const input = (id: string, value: string) => act(async () => {
    const n = node(id);
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(n, value);
    n.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  const send = async (text: string) => { await input('help-desk-input', text); await act(async () => { (node('help-desk-input').closest('form') as unknown as HTMLFormElement).requestSubmit(); }); };
  const exchanges = () => doc.querySelectorAll('[data-testid^="help-desk-exchange-"]').length;
  try {
    const { default: HelpDesk } = await server.ssrLoadModule('/src/components/help-desk.tsx');
    const knowledge = await server.ssrLoadModule('/src/lib/help-desk-knowledge.ts');
    await act(async () => root.render(React.createElement(Router, {
      base: '/sbu',
      hook: () => ['/dashboard', () => {}] as [string, (location: string) => void],
      children: React.createElement(HelpDesk),
    })));
    assert.match(node('help-desk-trigger').textContent!, /Bantuan/);
    assert.equal(find('help-desk-dialog'), null);
    await click('help-desk-trigger');
    const dialog = node('help-desk-dialog');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.match(dialog.textContent!, /Help Desk/);
    assert.match(dialog.textContent!, /berbasis panduan/);
    assert.match(dialog.textContent!, /tidak memakai kuota AI/);
    assert.equal((dialog as unknown as HTMLElement).style.top, '12px');
    await act(async () => {
      viewport.height = 280; viewport.offsetTop = 36;
      viewport.dispatchEvent(new win.Event('resize'));
    });
    assert.equal((dialog as unknown as HTMLElement).style.top, '48px', 'panel follows keyboard viewport');
    assert.equal((dialog as unknown as HTMLElement).style.height, '256px');
    assert.equal(doc.querySelectorAll('[data-testid^="help-desk-quick-"]').length, Math.min(6, knowledge.HELP_QUICK_QUESTIONS.length));

    await send('   ');
    assert.equal(exchanges(), 0, 'whitespace rejected');

    const q = 'Bagaimana cara membuat kasus SBU?';
    const expected = knowledge.resolveHelpQuestion(q);
    await send(q);
    assert.equal(exchanges(), 1);
    const answer = doc.querySelector('[data-testid^="help-desk-answer-"]')!;
    assert.match(answer.textContent!, new RegExp(expected.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(answer.textContent!, /Sumber:/);
    const links = answer.querySelectorAll('a');
    assert.equal(links.length, expected.links.length);
    expected.links.forEach((l: { path: string }, i: number) => assert.equal(links[i].getAttribute('href'), `/sbu${l.path}`));
    assert.ok(answer.querySelectorAll('[data-testid^="help-desk-related-"]').length <= 3);
    assert.equal((node('help-desk-input') as unknown as HTMLInputElement).value, '', 'draft cleared after send');

    const evil = '<img src=x onerror="alert(1)"><b>tebal</b>';
    await send(evil);
    assert.equal(doc.querySelector('[data-testid^="help-desk-log"] img'), null);
    assert.equal(doc.querySelector('[data-testid="help-desk-log"] b'), null);
    assert.ok([...doc.querySelectorAll('[data-testid^="help-desk-question-"]')].some(n => n.textContent === evil));

    await send('x'.repeat(900));
    const last = [...doc.querySelectorAll('[data-testid^="help-desk-question-"]')].pop()!;
    assert.ok(last.textContent!.length <= 600);

    await input('help-desk-input', 'draf tertahan');
    await click('help-desk-close');
    assert.equal(find('help-desk-dialog'), null);
    await click('help-desk-trigger');
    assert.equal(exchanges(), 3, 'state kept across close/reopen');
    assert.equal((node('help-desk-input') as unknown as HTMLInputElement).value, 'draf tertahan');

    for (let i = 0; i < 14; i++) await send(`pertanyaan ${i}`);
    assert.equal(exchanges(), 12, 'history bounded');

    await click('help-desk-reset');
    assert.equal(exchanges(), 0);
    assert.ok(find('help-desk-welcome'));
    assert.equal((node('help-desk-input') as unknown as HTMLInputElement).value, '');

    await send('upload dokumen');
    await input('help-desk-input', 'draf akun lama');
    await act(async () => root.render(React.createElement(Router, {
      hook: () => ['/dashboard', () => {}] as [string, (location: string) => void],
      children: React.createElement(HelpDesk, { key: 'different-identity' }),
    })));
    await click('help-desk-trigger');
    assert.equal(exchanges(), 0, 'identity-key remount clears old history');
    assert.equal((node('help-desk-input') as unknown as HTMLInputElement).value, '', 'identity remount clears draft');
    assert.equal(requests, 0);
    assert.deepEqual(storageWrites, []);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await win.happyDOM.close();
    g.window = before.window; g.document = before.document; g.fetch = before.fetch;
    g.IS_REACT_ACT_ENVIRONMENT = before.act;
    for (const [key, descriptor] of savedGlobals) {
      if (descriptor) Object.defineProperty(g, key, descriptor);
      else Reflect.deleteProperty(g, key);
    }
  }
});
