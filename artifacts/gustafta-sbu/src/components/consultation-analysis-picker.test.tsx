import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AnalysisChoice } from './consultation-analysis-picker';

test('cuplikan privat mengikat persetujuan ke hasil, revisi dan teks persis tanpa membaca berkas asli', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = { window: globals.window, document: globals.document, fetch: globals.fetch,
    actEnvironment: globals.IS_REACT_ACT_ENVIRONMENT };
  const window = new HappyWindow({ url: 'http://localhost/' });
  globals.window = window as unknown as Window & typeof globalThis;
  globals.document = window.document as unknown as Document;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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
  let choice: AnalysisChoice = { ready: true };
  const onChange = (c: AnalysisChoice) => { choice = c; };
  const documentId = '11111111-1111-4111-8111-111111111111';
  const firstId = '22222222-2222-4222-8222-222222222222';
  const secondId = '33333333-3333-4333-8333-333333333333';
  let revision = 'a'.repeat(64);
  try {
    const { ConsultationAnalysisPicker } = await server.ssrLoadModule('/src/components/consultation-analysis-picker.tsx');
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx');
    function Harness() {
      const client = useQueryClient();
      clients.add(client);
      client.setDefaultOptions({ queries: { gcTime: 0, retry: false }, mutations: { gcTime: 0 } });
      return createElement(ConsultationAnalysisPicker, { caseId: 1, onChange });
    }
    const readRequests: string[] = [];
    globals.fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get('X-SBU-Form-Owner'), 'owner-a');
      assert.ok(!init?.method || init.method === 'GET');
      const path = String(url);
      readRequests.push(path);
      if (path.endsWith('/documents')) return Response.json([
        { id: documentId, name: 'Pilihan.pdf', version: 2, status: 'ready', scanStatus: 'clean' },
        { id: 'infected', name: 'Quarantined.pdf', version: 1, status: 'ready', scanStatus: 'infected' },
      ]);
      if (path.endsWith('/analyses')) return Response.json([firstId, secondId].map(id => ({
        id, focus: id === firstId ? 'legalitas' : 'keuangan', createdAt: '2026-01-01T00:00:00Z', sourceVersion: 2,
      })));
      assert.ok(path.endsWith('/consultation-preview'), 'only metadata and selected preview are read');
      const analysisId = path.includes(secondId) ? secondId : firstId;
      return Response.json({ caseId: 1, documentId, analysisId, revision, sourceVersion: 2,
        sourcePages: [2, 4], focus: 'legalitas', model: 'synthetic-model', createdAt: '2026-01-01T00:00:00Z',
        text: analysisId === firstId ? 'Ringkasan\nTeks privat pertama untuk dipilih' : 'Ringkasan\nHasil kedua berbeda' });
    };
    const wait = async (fn: () => boolean) => {
      const until = Date.now() + 3000;
      while (!fn()) {
        assert.ok(Date.now() < until, 'picker selesai diperbarui');
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      }
    };
    const element = (id: string) => {
      const el = container.querySelector(`[data-testid="${id}"]`);
      assert.ok(el, id);
      return el as unknown as HTMLInputElement;
    };
    const select = async (id: string, value: string) => act(async () => {
      const el = element(id);
      el.value = value;
      el.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    const input = async (value: string) => act(async () => {
      const el = element('input-analysis-excerpt');
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    });
    await act(async () => root.render(createElement(AccountQueries, { userId: 'owner-a', children: createElement(Harness) })));
    await wait(() => container.textContent!.includes('Pilihan.pdf'));
    assert.doesNotMatch(container.textContent!, /Quarantined/);
    assert.equal(readRequests.length, 1, 'no results are loaded before choosing a document');
    await select('select-consult-document', documentId);
    await wait(() => container.textContent!.includes('keuangan'));
    await select('select-consult-analysis', firstId);
    await wait(() => !!container.querySelector('[data-testid="input-analysis-excerpt"]'));
    assert.equal(choice.ready, false);
    assert.equal(choice.selection, undefined);
    await act(async () => element('checkbox-approve-analysis').click());
    assert.equal(choice.ready, true);
    assert.equal((choice as AnalysisChoice).selection?.analysisId, firstId);
    await input('Teks privat pertama');
    assert.equal(element('checkbox-approve-analysis').checked, false);
    assert.equal(choice.ready, false);
    await act(async () => element('checkbox-approve-analysis').click());
    assert.deepEqual(choice.selection, { documentId, analysisId: firstId, revision, excerpt: 'Teks privat pertama', consent: true });
    await input('teks karangan');
    assert.equal(choice.selection, undefined);
    assert.equal(element('checkbox-approve-analysis').disabled, true);
    await input('x'.repeat(4001));
    assert.equal(element('checkbox-approve-analysis').disabled, true);
    await select('select-consult-analysis', secondId);
    await wait(() => !!(container.querySelector('[data-testid="input-analysis-excerpt"]') as unknown as HTMLTextAreaElement | null)?.value.includes('Hasil kedua'));
    assert.equal(element('checkbox-approve-analysis').checked, false);
    assert.equal(choice.ready, false);
    await act(async () => element('checkbox-approve-analysis').click());
    revision = 'b'.repeat(64);
    await act(async () => { for (const client of clients) await client.invalidateQueries(); });
    await wait(() => choice.selection === undefined);
    assert.equal(element('checkbox-approve-analysis').checked, false, 'changed source revision revokes prior approval');
    revision = 'a'.repeat(64);
    await act(async () => { for (const client of clients) await client.invalidateQueries(); });
    assert.equal(choice.selection, undefined, 'returning to a former revision must not revive old consent');
    await select('select-consult-document', '');
    assert.equal(choice.ready, true);
    assert.equal(choice.selection, undefined);
    assert.equal(container.querySelector('[data-testid="input-analysis-excerpt"]'), null);
  } finally {
    await act(async () => root.unmount());
    for (const client of clients) client.clear();
    await server.close(); await window.happyDOM.close(); container.remove();
    globals.window = previous.window; globals.document = previous.document; globals.fetch = previous.fetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
  }
});
