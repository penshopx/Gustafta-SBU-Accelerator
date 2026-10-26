import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

const USER = 'owner-a';
const quota = { userId: USER, dailyLimit: 30, dailyRemaining: 20, dailyResetAt: '2026-10-19T00:00:00.000Z', minuteLimit: 6, minuteRemaining: 5, minuteResetAt: '2026-10-18T12:01:00.000Z', busy: false, retryAfterSeconds: 0 };
const specialists = [{ id: 'sbuclaw', name: 'SBUClaw', group: 'Inti', description: 'Umum', prompts: ['a', 'b', 'c'], knowledgeStatus: 'Terkurasi' }];
const A = '11111111-1111-4111-8111-111111111111', B = '33333333-3333-4333-8333-333333333333', C = '44444444-4444-4444-8444-444444444444';
const AN = '22222222-2222-4222-8222-222222222222', AN_BAD = '55555555-5555-4555-8555-555555555555', AN_OLD = '66666666-6666-4666-8666-666666666666';
const REV = 'b'.repeat(64);
const TEXT = 'Alinea satu tentang legalitas. Alinea dua tentang pengalaman.';
const doc = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, caseId: 1, ownerId: USER, name, size: 100, contentType: 'application/pdf', status: 'ready', scanStatus: 'clean', version: 2, category: 'legalitas', description: '', createdAt: '2026-01-01T00:00:00Z', caseName: 'PT Uji Satu', ...over });
const an = (id: string, version: number) => ({ id, documentId: A, caseId: 1, ownerId: USER, focus: 'legalitas', sourceVersion: version, sourcePages: [1], sourcePageCount: 1, model: 'm', createdAt: '2026-01-02T00:00:00Z', result: {}, disclaimer: 'd' });

test('Ruang Simpan: Asisten Dokumen terkunci pada satu dokumen, opt-in, persetujuan persis, gagal tertutup', async () => {
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
  let docVersion = 2;
  let docOwner = USER;
  let analyses: unknown[] = [an(AN, 2), an(AN_BAD, 2), an(AN_OLD, 1), {
    ...an('77777777-7777-4777-8777-777777777777', 2), ownerId: 'owner-b',
  }];
  g.fetch = (async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      return Response.json({ analysisContext: body.analysisContext, purpose: body.purpose, quota, specialist: body.specialist, userId: USER, mode: body.mode, answer: 'Jawaban uji', disclaimer: 'd', retrievalNotice: 'n', citations: [] });
    }
    gets.push(path);
    if (path.endsWith('/specialists')) return Response.json(specialists);
    if (path.endsWith('/quota')) return Response.json(quota);
    if (path.endsWith('/budget')) return Response.json({ userId: USER, status: 'available', checkedAt: '2026-10-18T12:00:00.000Z', nextResetAt: null });
    if (path === '/api/cases') return Response.json([]);
    if (path.startsWith('/api/documents')) return Response.json({ userId: USER, total: 3, page: 1, pageSize: 50, documents: [doc(A, 'Legalitas.pdf'), doc(B, 'Menunggu.pdf', { status: 'pending', scanStatus: 'pending' }), doc(C, 'Terinfeksi.pdf', { scanStatus: 'infected' })] });
    if (path === '/api/cases/1/documents') return Response.json([doc(A, 'Legalitas.pdf', { version: docVersion, ownerId: docOwner })]);
    if (path === `/api/cases/1/documents/${A}/analyses`) return Response.json(analyses);
    const m = path.match(/analyses\/([^/]+)\/consultation-preview$/);
    if (m) return Response.json({ caseId: 1, documentId: A, analysisId: m[1] === AN_BAD ? AN : m[1], revision: REV, sourceVersion: 2, sourcePages: [1], model: 'm', focus: 'legalitas', createdAt: '2026-01-02T00:00:00Z', text: TEXT });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const $ = (id: string) => container.querySelector(`[data-testid="${id}"]`) as unknown as HTMLInputElement | null;
  const must = (id: string) => { const e = $(id); assert.ok(e, id); return e; };
  const click = async (id: string) => { await act(async () => { must(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event); }); await settle(); };
  const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
  const setVal = async (id: string, v: string, tag: 'Select' | 'TextArea') => { await act(async () => {
    const t = must(id);
    const proto = (window as unknown as Record<string, { prototype: object }>)[`HTML${tag}Element`].prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(t, v);
    t.dispatchEvent(new window.Event(tag === 'Select' ? 'change' : 'input', { bubbles: true }) as unknown as Event);
  }); await settle(); };
  const sendDisabled = () => must('button-send-chat').hasAttribute('disabled');
  const mark = () => gets.length;
  const open = async () => { await click(`button-assistant-${A}`); };
  const close = async () => { await click('button-close-document-chat'); };
  try {
    const { DocumentVaultPage } = await server.ssrLoadModule('/src/components/document-vault-page.tsx');
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx');
    function Harness() {
      const client = useQueryClient();
      clients.add(client);
      client.setDefaultOptions({ queries: { gcTime: 0, retry: false }, mutations: { gcTime: 0 } });
      return createElement(DocumentVaultPage, { expectedUserId: USER, canOwnCases: false });
    }
    await act(async () => { root.render(createElement(AccountQueries, { userId: USER }, createElement(Harness))); });
    await settle();

    // Action only for the clean, ready, owned document.
    must(`button-assistant-${A}`);
    assert.equal($(`button-assistant-${B}`), null);
    assert.equal($(`button-assistant-${C}`), null);
    assert.match(must(`button-assistant-${A}`).textContent!, /Asisten Dokumen/);

    // Opening reads metadata only: no provider call, no analysis before the document is verified.
    const before = mark();
    await open();
    assert.equal(posts.length, 0);
    assert.match(must('text-scoped-chat-title').textContent!, /Legalitas\.pdf.*versi 2/);
    assert.ok(gets.slice(before).includes('/api/cases/1/documents'));
    assert.ok(gets.slice(before).includes(`/api/cases/1/documents/${A}/analyses`));
    assert.ok(!gets.slice(before).some(p => p.includes(`/documents/${B}`) || p.includes(`/documents/${C}`)));
    assert.equal($('select-consult-document'), null);
    assert.equal($('select-chat-source-case'), null);
    assert.equal($('checkbox-chat-source'), null);
    assert.equal($('button-purpose-tutor_regulasi'), null);
    assert.match(must('text-scoped-document').textContent!, /Legalitas\.pdf/);
    assert.equal(must('checkbox-consent').checked, false);
    assert.ok(sendDisabled());
    // Other-version analysis is not offered.
    const opts = Array.from(container.querySelectorAll('[data-testid="select-consult-analysis"] option')).map(o => (o as unknown as HTMLOptionElement).value);
    assert.deepEqual(opts.sort(), ['', AN, AN_BAD].sort());

    // Mismatched preview fails closed.
    await setVal('select-consult-analysis', AN_BAD, 'Select');
    must('error-scoped-preview');
    assert.equal($('checkbox-approve-analysis'), null);
    assert.equal($('input-analysis-excerpt'), null, 'mismatched preview text must not be rendered');
    assert.ok(sendDisabled());

    // Valid analysis: exact excerpt + approval + global consent are all required.
    await setVal('select-consult-analysis', AN, 'Select');
    assert.equal($('error-scoped-preview'), null);
    await setVal('input-chat-message', 'Telaah bagian ini', 'TextArea');
    await click('checkbox-consent');
    assert.ok(sendDisabled());
    await click('checkbox-approve-analysis');
    assert.ok(!sendDisabled());
    assert.equal(posts.length, 0);
    await click('button-send-chat');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].purpose, 'pemeriksa_dokumen');
    assert.deepEqual(posts[0].analysisContext, { caseId: 1, selection: { documentId: A, analysisId: AN, revision: REV, excerpt: TEXT, consent: true } });
    assert.ok($('message-assistant-2'));
    assert.ok(must('select-consult-analysis').disabled && must('checkbox-approve-analysis').disabled);

    // New chat clears history, approval and global consent.
    await click('button-new-chat'); await click('button-confirm-ok');
    assert.equal($('message-assistant-2'), null);
    assert.equal(must('checkbox-consent').checked, false);
    assert.equal(must('select-consult-analysis').value, '');
    assert.ok(sendDisabled());

    // Close drops the chat; reopening starts unapproved.
    await close();
    assert.equal($('panel-document-chat'), null);
    await open();
    assert.equal(must('checkbox-consent').checked, false);
    assert.equal(must('select-consult-analysis').value, '');
    await close();

    // Version drift from the current API response blocks the source.
    docVersion = 3;
    const drift = mark();
    await open();
    must('error-scoped-document');
    assert.ok(!gets.slice(drift).some(p => p.endsWith('/analyses')));
    assert.equal($('select-consult-analysis'), null);
    await close();
    docVersion = 2;

    // A current metadata response belonging to another owner must not open its analysis history.
    docOwner = 'owner-b';
    const foreignOwner = mark();
    await open();
    must('error-scoped-document');
    assert.ok(!gets.slice(foreignOwner).some(p => p.endsWith('/analyses')));
    assert.equal($('select-consult-analysis'), null);
    assert.ok(sendDisabled());
    await close();
    docOwner = USER;

    // No analysis: route to the real Bedah Dokumen panel and back, draft kept, approval gone.
    analyses = [];
    await open();
    await setVal('input-chat-message', 'Draf tersimpan', 'TextArea');
    await click('button-open-bedah-from-chat');
    assert.equal($('panel-document-chat'), null);
    assert.ok(container.querySelector('[role="dialog"][aria-label="Bedah Dokumen"]'));
    assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
    analyses = [an(AN, 2)];
    await act(async () => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); });
    await settle();
    must('panel-document-chat');
    assert.equal(must('input-chat-message').value, 'Draf tersimpan');
    assert.equal(must('checkbox-consent').checked, false);
    assert.ok(must('select-consult-analysis'));
    assert.equal(posts.length, 1);
  } finally {
    await act(async () => { root.unmount(); });
    clients.forEach(c => c.clear());
    await server.close();
    g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; g.IS_REACT_ACT_ENVIRONMENT = prev.act;
    keys.forEach((k, i) => { if (saved[i]) Object.defineProperty(g, k, saved[i]!); else delete gx[k]; });
    await window.happyDOM.close();
  }
});
