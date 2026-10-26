import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

const USER = 'owner-a';
const quota = { userId: USER, dailyLimit: 30, dailyRemaining: 20, dailyResetAt: '2026-10-19T00:00:00.000Z', minuteLimit: 6, minuteRemaining: 5, minuteResetAt: '2026-10-18T12:01:00.000Z', busy: false, retryAfterSeconds: 0 };
const specialists = [{ id: 'sbuclaw', name: 'SBUClaw', group: 'Inti', description: 'Umum', prompts: ['a', 'b', 'c'], knowledgeStatus: 'Terkurasi' }];
const DOC = '11111111-1111-4111-8111-111111111111';
const AN = '22222222-2222-4222-8222-222222222222';
const REV = 'a'.repeat(64);
const TEXT = 'Alinea satu tentang legalitas. Alinea dua tentang pengalaman.';

test('Asisten Pemeriksa Dokumen: sumber Bedah Dokumen opt-in, persetujuan persis, echo fail-closed, kunci', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const gx = g as unknown as Record<string, unknown>;
  const keys = ['location', 'history', 'navigator', 'addEventListener', 'removeEventListener', 'dispatchEvent'];
  const saved = keys.map(k => Object.getOwnPropertyDescriptor(g, k));
  const prev = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const window = new HappyWindow({ url: 'http://localhost/' });
  const wx = window as unknown as Record<string, unknown>;
  g.window = window as unknown as Window & typeof globalThis;
  g.document = window.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of keys) Object.defineProperty(g, k, { value: typeof wx[k] === 'function' ? (wx[k] as (...a: unknown[]) => unknown).bind(window) : wx[k], configurable: true, writable: true });
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
  const clients = new Set<QueryClient>();
  const gets: string[] = [];
  const posts: Record<string, unknown>[] = [];
  let echo: 'ok' | 'missing' | 'mismatch' | 'extra' = 'ok';
  let hold: Promise<void> | null = null;
  g.fetch = (async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      if (hold) await hold;
      let ctx = body.analysisContext;
      if (ctx && echo === 'missing') ctx = undefined;
      if (ctx && echo === 'mismatch') ctx = { ...ctx, selection: { ...ctx.selection, excerpt: 'lain' } };
      if (ctx && echo === 'extra') ctx = { ...ctx, selection: { ...ctx.selection, extra: 1 } };
      if (!body.analysisContext && echo === 'extra') ctx = { caseId: 1 };
      return Response.json({ ...(ctx ? { analysisContext: ctx } : {}), purpose: body.purpose, quota, specialist: body.specialist, userId: USER, mode: body.mode, answer: 'Jawaban uji', disclaimer: 'd', retrievalNotice: 'n', citations: [] });
    }
    gets.push(path);
    if (path.endsWith('/specialists')) return Response.json(specialists);
    if (path.endsWith('/quota')) return Response.json(quota);
    if (path.endsWith('/budget')) return Response.json({ userId: USER, status: 'available', checkedAt: '2026-10-18T12:00:00.000Z', nextResetAt: null });
    if (path === '/api/cases') return Response.json([{ id: 1, companyName: 'PT Uji Satu', requestType: 'baru', qualification: 'kecil', classification: 'G', status: 'draf', existingSbuExpiresOn: null, updatedAt: '2026-01-01T00:00:00Z' }]);
    if (path === '/api/cases/1/documents') return Response.json([{ id: DOC, caseId: 1, ownerId: USER, name: 'Legalitas.pdf', size: 10, contentType: 'application/pdf', status: 'ready', scanStatus: 'clean', version: 1, createdAt: '2026-01-01T00:00:00Z' }]);
    if (path === `/api/cases/1/documents/${DOC}/analyses`) return Response.json([{ id: AN, documentId: DOC, caseId: 1, ownerId: USER, focus: 'legalitas', sourceVersion: 1, sourcePages: [1], sourcePageCount: 1, model: 'm', createdAt: '2026-01-02T00:00:00Z', result: {}, disclaimer: 'd' }]);
    if (path === `/api/cases/1/documents/${DOC}/analyses/${AN}/consultation-preview`) return Response.json({ caseId: 1, documentId: DOC, analysisId: AN, revision: REV, sourceVersion: 1, sourcePages: [1], model: 'm', focus: 'legalitas', createdAt: '2026-01-02T00:00:00Z', text: TEXT });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const $ = (id: string) => container.querySelector(`[data-testid="${id}"]`) as unknown as HTMLInputElement | null;
  const must = (id: string) => { const e = $(id); assert.ok(e, id); return e; };
  const click = async (id: string) => { await act(async () => { must(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event); }); };
  const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
  const setVal = async (id: string, v: string, tag: 'Select' | 'TextArea') => { await act(async () => {
    const t = must(id);
    const proto = (window as unknown as Record<string, { prototype: object }>)[`HTML${tag}Element`].prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(t, v);
    t.dispatchEvent(new window.Event(tag === 'Select' ? 'change' : 'input', { bubbles: true }) as unknown as Event);
  }); await settle(); };
  const type = (v: string) => setVal('input-chat-message', v, 'TextArea');
  const sendDisabled = () => must('button-send-chat').hasAttribute('disabled');
  try {
    const { default: Page } = await server.ssrLoadModule('/src/components/sbu-chat-page.tsx');
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx');
    function Harness() {
      const client = useQueryClient();
      clients.add(client);
      client.setDefaultOptions({ queries: { gcTime: 0, retry: false }, mutations: { gcTime: 0 } });
      return createElement(Page, { expectedUserId: USER, initialRole: 'kontraktor' });
    }
    await act(async () => { root.render(createElement(AccountQueries, { userId: USER }, createElement(Harness))); });
    await settle();
    assert.equal($('panel-chat-analysis'), null);
    await click('button-purpose-pemeriksa_dokumen');
    await click('checkbox-consent');
    assert.equal(must('checkbox-chat-source').checked, false);
    assert.ok(!gets.some(p => p.startsWith('/api/cases')));

    // Opt in: only the case list is read.
    await click('checkbox-chat-source'); await settle();
    assert.deepEqual(gets.filter(p => p.startsWith('/api/cases')), ['/api/cases']);
    await type('Telaah cuplikan ini');
    assert.ok(sendDisabled());
    await setVal('select-chat-source-case', '1', 'Select');
    await setVal('select-consult-document', DOC, 'Select');
    await setVal('select-consult-analysis', AN, 'Select');
    assert.match(must('input-analysis-excerpt').value, /Alinea satu/);
    assert.match(container.textContent!, /Claude Sonnet 5\.5/);
    assert.ok(sendDisabled());
    await click('checkbox-approve-analysis');
    assert.ok(!sendDisabled());
    assert.equal(posts.length, 0);
    // Editing the excerpt invalidates approval.
    await setVal('input-analysis-excerpt', 'Alinea satu tentang legalitas.', 'TextArea');
    assert.ok(sendDisabled());
    await setVal('input-analysis-excerpt', 'Alinea dua tentang pengalaman.', 'TextArea');
    assert.ok(sendDisabled());
    await click('checkbox-approve-analysis');
    assert.ok(!sendDisabled());

    // In flight: sources locked.
    let release!: () => void; hold = new Promise<void>(r => { release = r; });
    await click('button-send-chat'); await settle();
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].analysisContext, { caseId: 1, selection: { documentId: DOC, analysisId: AN, revision: REV, excerpt: 'Alinea dua tentang pengalaman.', consent: true } });
    assert.equal(posts[0].purpose, 'pemeriksa_dokumen');
    assert.ok(must('select-chat-source-case').disabled && must('select-consult-document').disabled && must('checkbox-approve-analysis').disabled && must('checkbox-chat-source').disabled);
    hold = null; release(); await settle();
    assert.ok($('message-assistant-2'));
    assert.ok(must('select-consult-analysis').disabled && must('input-analysis-excerpt').disabled);
    assert.ok(must('text-source-locked'));
    assert.equal(must('input-analysis-excerpt').value, 'Alinea dua tentang pengalaman.');

    // Reset clears source and consent even on the same purpose.
    await click('button-new-chat'); await click('button-confirm-ok');
    assert.equal($('panel-chat-source'), null);
    assert.equal(must('checkbox-chat-source').checked, false);
    assert.equal($('message-assistant-2'), null);

    // Text-only mode still works and sends no context.
    await type('Tanpa sumber');
    await click('button-send-chat'); await settle();
    assert.equal(posts.length, 2);
    assert.equal('analysisContext' in posts[1], false);
    await click('button-new-chat'); await click('button-confirm-ok');

    // Echo failures fail closed and keep the draft.
    for (const mode of ['missing', 'mismatch', 'extra'] as const) {
      echo = mode;
      await click('checkbox-chat-source'); await settle();
      await setVal('select-chat-source-case', '1', 'Select');
      await setVal('select-consult-document', DOC, 'Select');
      await setVal('select-consult-analysis', AN, 'Select');
      await click('checkbox-approve-analysis');
      await type('Uji echo ' + mode);
      const before: number = posts.length;
      await click('button-send-chat'); await settle();
      assert.equal(posts.length, before + 1);
      assert.match(must('text-chat-error').textContent!, /tidak ditampilkan/);
      assert.equal($('message-assistant-2'), null);
      assert.equal(must('input-chat-message').value, 'Uji echo ' + mode);
      await click('checkbox-chat-source'); // opt out (no messages yet)
      assert.equal($('panel-chat-source'), null);
      await type(''); await click('button-new-chat').catch(() => {});
    }

    // Unexpected echo for a text-only request is refused too.
    echo = 'extra';
    await type('Teks saja');
    await click('button-send-chat'); await settle();
    assert.match(must('text-chat-error').textContent!, /tidak ditampilkan/);
  } finally {
    await act(async () => { root.unmount(); });
    clients.forEach(c => c.clear());
    await server.close();
    g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; g.IS_REACT_ACT_ENVIRONMENT = prev.act;
    keys.forEach((k, i) => { if (saved[i]) Object.defineProperty(g, k, saved[i]!); else delete gx[k]; });
    await window.happyDOM.close();
  }
});
