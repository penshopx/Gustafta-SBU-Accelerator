import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

const USER = 'owner-a';
const quota = { userId: USER, dailyLimit: 30, dailyRemaining: 20, dailyResetAt: '2026-10-19T00:00:00.000Z', minuteLimit: 6, minuteRemaining: 5, minuteResetAt: '2026-10-18T12:01:00.000Z', busy: false, retryAfterSeconds: 0 };
const specialists = [{ id: 'sbuclaw', name: 'SBUClaw', group: 'Inti', description: 'Umum', prompts: ['Contoh spesialis satu', 'dua', 'tiga'], knowledgeStatus: 'Terkurasi' }];
const IDS = ['tutor_regulasi', 'permohonan_baru', 'perpanjangan', 'pemeriksa_dokumen', 'studi_kasus', 'pendamping_proses'];
const ROLES = ['bujk', 'pendamping', 'asesor', 'lsbu', 'asosiasi', 'umum'];

test('Asisten: enam tujuan terpisah dari peran dan spesialis, tanpa kirim otomatis', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const gx = g as unknown as Record<string, unknown>;
  const keys = ['location', 'history', 'navigator', 'addEventListener', 'removeEventListener', 'dispatchEvent'];
  const saved = keys.map(k => Object.getOwnPropertyDescriptor(g, k));
  const prev = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const window = new HappyWindow({ url: 'http://localhost/' });
  g.window = window as unknown as Window & typeof globalThis;
  g.document = window.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of keys) Object.defineProperty(g, k, { value: typeof (window as unknown as Record<string, unknown>)[k] === 'function' ? ((window as unknown as Record<string, (...a: unknown[]) => unknown>)[k]).bind(window) : (window as unknown as Record<string, unknown>)[k], configurable: true, writable: true });
  void gx;
  const { createRoot } = await import('react-dom/client');
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), appType: 'custom',
    server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { dedupe: ['react', 'react-dom'], alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } }, esbuild: { jsx: 'automatic' },
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
  });
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  const posts: { purpose?: string; mode: string; messages: unknown[] }[] = [];
  const clients = new Set<QueryClient>();
  function TestPage({ Page }: { Page: React.ComponentType<{ expectedUserId: string; initialRole: string }> }) {
    const client = useQueryClient();
    clients.add(client);
    // Observer teardown can schedule GC after the provider's own clear().
    // Do not leave five-minute cache timers behind in an isolated Node test.
    client.setDefaultOptions({ queries: { retry: false, gcTime: 0 } });
    return createElement(Page, { expectedUserId: USER, initialRole: 'konsultan' });
  }
  let echo: string | null = null;
  g.fetch = (async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      return Response.json({ purpose: echo ?? body.purpose, quota, specialist: body.specialist, userId: USER, mode: body.mode, answer: 'Jawaban uji', disclaimer: 'd', retrievalNotice: 'n', citations: [] });
    }
    if (path.endsWith('/specialists')) return Response.json(specialists);
    if (path.endsWith('/quota')) return Response.json(quota);
    if (path.endsWith('/budget')) return Response.json({ userId: USER, status: 'available', checkedAt: '2026-10-18T12:00:00.000Z', nextResetAt: null });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const $ = (id: string) => container.querySelector(`[data-testid="${id}"]`) as unknown as HTMLElement | null;
  const must = (id: string) => { const e = $(id); assert.ok(e, id); return e; };
  const click = async (id: string) => { await act(async () => { must(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event); }); };
  const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
  const type = async (v: string) => { await act(async () => {
    const t = must('input-chat-message') as unknown as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(t, v);
    t.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
  }); };
  const draft = () => (must('input-chat-message') as unknown as HTMLTextAreaElement).value;
  try {
    const { default: Page } = await server.ssrLoadModule('/src/components/sbu-chat-page.tsx');
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx');
    await act(async () => { root.render(createElement(AccountQueries, { userId: USER }, createElement(TestPage, { Page }))); });
    await settle();

    // Defaults: tutor_regulasi, role default kept, all controls present.
    assert.equal(must('button-purpose-tutor_regulasi').getAttribute('aria-checked'), 'true');
    assert.equal(must('button-mode-pendamping').getAttribute('aria-checked'), 'true');
    for (const id of IDS) must(`button-purpose-${id}`);
    for (const id of ROLES) must(`button-mode-${id}`);
    must('select-chat-specialist');

    // Each purpose: distinct guidance and starter populate draft only, no POST.
    const intros = new Set<string>();
    for (const id of IDS) {
      await click(`button-purpose-${id}`);
      assert.equal(must(`button-purpose-${id}`).getAttribute('aria-checked'), 'true');
      intros.add(must('text-purpose-intro').textContent!);
      assert.equal(must('button-mode-pendamping').getAttribute('aria-checked'), 'true');
      await click('button-suggestion-0');
      assert.ok(draft().length > 10);
      await click('button-new-chat'); await click('button-confirm-ok');
      assert.equal(draft(), '');
    }
    assert.equal(intros.size, 6);
    await click('button-purpose-pemeriksa_dokumen');
    assert.match(must('text-purpose-note').textContent!, /tidak ada berkas yang dibaca/i);
    assert.equal(must('link-purpose-documents').getAttribute('href'), '/documents');
    assert.equal(posts.length, 0);

    // Real request carries purpose, role and specialist independently.
    await click('checkbox-consent');
    await click('button-purpose-studi_kasus');
    await click('button-mode-asesor');
    await type('Skenario hipotetis');
    await click('button-send-chat'); await settle();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].purpose, 'studi_kasus');
    assert.equal(posts[0].mode, 'asesor');
    assert.ok($('message-assistant-2'));

    // Dirty purpose change: cancel preserves, confirm resets and sends no old history.
    await click('button-purpose-perpanjangan');
    await click('button-confirm-cancel');
    assert.equal(must('button-purpose-studi_kasus').getAttribute('aria-checked'), 'true');
    assert.ok($('message-assistant-2'));
    await click('button-purpose-perpanjangan');
    await click('button-confirm-ok');
    assert.equal(must('button-purpose-perpanjangan').getAttribute('aria-checked'), 'true');
    assert.equal($('message-assistant-2'), null);
    assert.equal(must('button-mode-asesor').getAttribute('aria-checked'), 'true');
    await type('Pertanyaan baru');
    await click('button-send-chat'); await settle();
    assert.equal(posts.length, 2);
    assert.equal(posts[1].purpose, 'perpanjangan');
    assert.equal(posts[1].messages.length, 1);

    // Echoed purpose mismatch is refused.
    echo = 'tutor_regulasi';
    await type('Lagi');
    await click('button-send-chat'); await settle();
    assert.equal(posts.length, 3);
    assert.match(must('text-chat-error').textContent!, /tidak ditampilkan/);
    assert.equal(container.textContent!.split('Jawaban uji').length - 1, 1);
  } finally {
    await act(async () => { root.unmount(); });
    for (const client of clients) { await client.cancelQueries(); client.clear(); }
    await server.close();
    g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; g.IS_REACT_ACT_ENVIRONMENT = prev.act;
    keys.forEach((k, i) => { if (saved[i]) Object.defineProperty(g, k, saved[i]!); else delete gx[k]; });
    await window.happyDOM.close();
  }
});
