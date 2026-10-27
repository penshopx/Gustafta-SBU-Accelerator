import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { SmapChecklist, SmapEntry } from '@workspace/api-client-react';

test('checklist SMAP: payload pemilik, draf tidak tertimpa, telaah terpisah, riwayat dan dokumen usang', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = { window: globals.window, document: globals.document, fetch: globals.fetch, actEnvironment: globals.IS_REACT_ACT_ENVIRONMENT };
  const window = new HappyWindow({ url: 'http://localhost/' });
  globals.window = window as unknown as Window & typeof globalThis;
  globals.document = window.document as unknown as Document;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  const { createRoot } = await import('react-dom/client');
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), appType: 'custom',
    server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { dedupe: ['react', 'react-dom'] }, esbuild: { jsx: 'automatic' },
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
  });
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  const clients = new Set<QueryClient>();
  const fp = 'c'.repeat(64);
  const doc = { id: 'doc-1', name: 'Kebijakan anti penyuapan', version: 2, fingerprint: fp };
  let entries: SmapEntry[] = [];
  let history: SmapEntry[] = [];
  let docs = [doc];
  let saveStatus = 409;
  const saves: Record<string, unknown>[] = [];
  let gate: Promise<void> | null = null;
  const reviews: Record<string, unknown>[] = [];
  const checklist = (): SmapChecklist => ({
    caseId: 1, templateVersion: 'draf-1', disclaimer: 'Checklist internal, bukan sertifikasi.',
    questions: [
      { id: 'q1', group: 'Kebijakan', text: 'Apakah kebijakan tersedia?', source: 'Draf rujukan butir 5.2 halaman 7', suggestedEvidence: 'Dokumen kebijakan', reviewFocus: 'Tanggal pengesahan' },
      { id: 'q2', group: 'Operasi', text: 'Apakah uji tuntas dilakukan?', source: 'Butir 8.2', suggestedEvidence: 'Formulir', reviewFocus: 'Cakupan' },
    ], entries, documents: docs,
  });
  try {
    const { CaseSmapChecklist } = await server.ssrLoadModule('/src/components/case-smap-checklist.tsx');
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx');
    function Harness() {
      const client = useQueryClient(); clients.add(client);
      client.setDefaultOptions({ queries: { gcTime: 0, retry: false }, mutations: { gcTime: 0 } });
      return createElement(CaseSmapChecklist, { caseId: 1, expectedUserId: 'owner-a' });
    }
    globals.fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get('X-SBU-Form-Owner'), 'owner-a');
      const path = String(url);
      if (path.endsWith('/history')) return Response.json(history);
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)); saves.push(body);
        if (gate) await gate;
        if (saveStatus !== 200) return Response.json({ error: 'x' }, { status: saveStatus });
        const e: SmapEntry = { questionId: 'q1', revision: body.revision + 1, answer: body.answer, notes: body.notes,
          evidence: body.evidence.map(() => doc), reviewStatus: 'unreviewed', reviewNote: '', reviewedBy: null, reviewedAt: null,
          savedAt: '2026-10-20T01:00:00Z', needsReview: false };
        entries = [e]; history = [e, ...history]; return Response.json(e);
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)); reviews.push(body);
        entries = [{ ...entries[0], reviewStatus: body.status, reviewNote: body.note, reviewedBy: 'owner-a', reviewedAt: '2026-10-20T02:00:00Z' }];
        history = [entries[0], ...history]; return Response.json(entries[0]);
      }
      return Response.json(checklist());
    };
    const el = (id: string) => { const e = container.querySelector(`[data-testid="${id}"]`); assert.ok(e, id); return e as unknown as HTMLInputElement; };
    const has = (id: string) => !!container.querySelector(`[data-testid="${id}"]`);
    const wait = async (fn: () => boolean) => { const until = Date.now() + 3000; while (!fn()) { assert.ok(Date.now() < until, 'UI diperbarui'); await act(async () => { await new Promise(r => setTimeout(r, 5)); }); } };
    const click = async (id: string) => act(async () => { el(id).click(); });
    const type = async (id: string, value: string) => act(async () => {
      const e = el(id); Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(e, value);
      e.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    });
    const refetch = async () => act(async () => { for (const c of clients) await c.refetchQueries(); });

    await act(async () => root.render(createElement(AccountQueries, { userId: 'owner-a', children: createElement(Harness) })));
    await wait(() => has('button-smap-question-q1'));
    assert.match(el('text-smap-disclaimer').textContent!, /bukan sertifikasi/);
    assert.match(el('text-smap-edition').textContent!, /belum diverifikasi/);
    assert.doesNotMatch(container.textContent!, /%|skor|lulus\b/i);
    await click('button-smap-question-q1');
    assert.match(el('text-smap-source').textContent!, /halaman 7/);
    assert.equal(el('button-smap-review-save').disabled, true, 'telaah tidak tersedia sebelum ada simpanan');
    await click('radio-smap-answer-ada');
    await type('input-smap-notes', 'Draf pemilik');
    await click('checkbox-smap-doc-doc-1');
    await refetch();
    assert.equal(el('input-smap-notes').value, 'Draf pemilik', 'polling tidak menimpa draf');
    await click('button-smap-save');
    await wait(() => has('text-smap-conflict'));
    assert.deepEqual(saves[0], { revision: 0, answer: 'ada', notes: 'Draf pemilik', evidence: [{ id: 'doc-1', fingerprint: fp }] });
    assert.equal(el('input-smap-notes').value, 'Draf pemilik', '409 mempertahankan draf');
    saveStatus = 500;
    await click('button-smap-reload');
    await wait(() => !has('text-smap-conflict'));
    await type('input-smap-notes', 'Draf kedua');
    await click('radio-smap-answer-ada');
    await click('checkbox-smap-doc-doc-1');
    await click('button-smap-save');
    await wait(() => has('text-smap-save-error'));
    assert.equal(el('input-smap-notes').value, 'Draf kedua', 'kegagalan mempertahankan isian');
    assert.doesNotMatch(el('text-smap-save-error').textContent!, /HTTP|500/);
    saveStatus = 200;
    let release!: () => void;
    gate = new Promise<void>(res => { release = res; });
    await click('button-smap-save');
    await wait(() => saves.length === 3);
    assert.equal((el('fieldset-smap-entry') as unknown as HTMLFieldSetElement).disabled, true, 'deklarasi terkunci saat menyimpan');
    assert.equal(el('button-smap-question-q2').disabled, true, 'pindah butir terkunci saat menyimpan');
    await type('input-smap-notes', 'Ketikan terlambat');
    await act(async () => { (el('button-smap-question-q2') as unknown as { onclick: unknown; click: () => void }).click(); });
    assert.equal(el('input-smap-notes').value, 'Draf kedua', 'edit saat pending diabaikan');
    assert.equal(el('text-smap-question').textContent, 'Apakah kebijakan tersedia?');
    await act(async () => { release(); }); gate = null;
    await wait(() => has('text-smap-saved'));
    assert.equal(el('input-smap-notes').value, 'Draf kedua');
    assert.deepEqual(saves[2], { revision: 0, answer: 'ada', notes: 'Draf kedua', evidence: [{ id: 'doc-1', fingerprint: fp }] });
    await type('input-smap-notes', 'Edit setelah simpan');
    await refetch();
    assert.equal(el('input-smap-notes').value, 'Edit setelah simpan', 'draf baru setelah simpan tidak hilang');
    await type('input-smap-notes', 'Draf kedua');
    await wait(() => has('row-smap-history-1'));
    assert.equal(el('button-smap-review-save').disabled, true);
    await click('button-smap-review-adequate');
    await type('input-smap-review-note', 'Dokumen sesuai');
    await click('button-smap-review-save');
    await wait(() => reviews.length === 1 && el('status-smap-review-q1').textContent!.includes('Memadai'));
    assert.deepEqual(reviews[0], { revision: 1, status: 'adequate', note: 'Dokumen sesuai' });
    assert.equal(saves.length, 3, 'telaah tidak memicu simpan deklarasi');
    docs = [];
    entries = [{ ...entries[0], needsReview: true }];
    await refetch();
    await wait(() => has('text-smap-needs-review') && has('list-smap-stale-docs'));
    assert.match(el('list-smap-history').textContent!, /Dokumen sesuai/);
    await type('input-smap-notes', 'Edit');
    assert.ok(has('text-smap-review-blocked'), 'telaah ditahan saat ada draf');
  } finally {
    await act(async () => root.unmount());
    for (const c of clients) c.clear();
    await server.close();
    await window.happyDOM.close();
    globals.window = previous.window; globals.document = previous.document; globals.fetch = previous.fetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
  }
});
