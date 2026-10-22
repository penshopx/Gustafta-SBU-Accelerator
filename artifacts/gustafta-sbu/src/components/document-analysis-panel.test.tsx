import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CaseDocument, DocumentAnalysis } from '@workspace/api-client-react';

test('pilihan halaman mengikat persetujuan, request owner, dan pemetaan riwayat setelah panel dibuka ulang', async () => {
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
    resolve: { dedupe: ['react', 'react-dom'], alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } }, esbuild: { jsx: 'automatic' },
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
  });
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  const clients = new Set<QueryClient>();
  try {
    const { DocumentAnalysisPanel } = await server.ssrLoadModule('/src/components/document-analysis-panel.tsx') as typeof import('./document-analysis-panel');
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx');
    const doc: CaseDocument = { id: '11111111-1111-4111-8111-111111111111', caseId: 1, ownerId: 'owner-a',
      name: 'Long.pdf', contentType: 'application/pdf', size: 8 * 1024 * 1024, status: 'ready',
      scanStatus: 'clean', category: 'keuangan', description: '', version: 3,
      scannedAt: null, createdAt: new Date().toISOString() };
    function Harness() {
      const client = useQueryClient();
      clients.add(client);
      client.setDefaultOptions({ queries: { gcTime: 0, retry: false }, mutations: { gcTime: 0 } });
      return createElement(DocumentAnalysisPanel, { doc, expectedUserId: 'owner-a', close() {} });
    }
    let rows: DocumentAnalysis[] = [];
    const previews: Record<string, unknown>[] = [];
    let delayPreview = false;
    let failPreview = false;
    let releasePreview: (() => void) | undefined;
    const requests: Record<string, unknown>[] = [];
    globals.fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get('X-SBU-Form-Owner'), 'owner-a');
      if (String(url).endsWith('/analysis-source')) return Response.json({
        documentId: doc.id, version: doc.version, pageCount: 40, sourceRevision: (doc.version === 3 ? 'a' : 'b').repeat(64), model: 'synthetic-model',
      });
      if (String(url).endsWith('/analysis-preview')) {
        const input = JSON.parse(String(init?.body));
        previews.push(input);
        if (delayPreview) await new Promise<void>(resolve => { releasePreview = resolve; });
        if (failPreview) return Response.json({ error: 'bad selection' }, { status: 422 });
        return Response.json({ documentId: doc.id, caseId: doc.caseId, version: doc.version,
          sourceRevision: input.sourceRevision, payloadBytes: 2048,
          images: input.pages.map((sourcePage: number) => ({ sourcePage, dataUrl: 'data:image/png;base64,aGVsbG8=' })) });
      }
      assert.ok(String(url).endsWith('/analyses'));
      if (init?.method !== 'POST') return Response.json(rows);
      const input = JSON.parse(String(init.body));
      requests.push(input);
      const result: DocumentAnalysis = { id: '22222222-2222-4222-8222-222222222222', documentId: doc.id,
        caseId: 1, ownerId: 'owner-a', focus: 'kesiapan_sbu', sourcePages: input.pages,
        sourcePageCount: 40, sourceVersion: 3, model: 'synthetic-model', createdAt: new Date().toISOString(),
        disclaimer: 'Wajib ditinjau manusia', result: { summary: 'Ringkasan halaman pilihan', extracted: [
          { label: 'Nilai', value: 'Terbaca', location: 'halaman lampiran 2' },
        ], concerns: [], missingInformation: [], nextSteps: ['Cocokkan dokumen asli'] } };
      rows = [result];
      return Response.json(result, { status: 201 });
    };
    const render = async (key: string) => {
      await act(async () => root.render(createElement(AccountQueries, { key, userId: 'owner-a',
        children: createElement(Harness) })));
    };
    const wait = async (fn: () => boolean) => {
      const until = Date.now() + 3000;
      while (!fn()) {
        assert.ok(Date.now() < until, 'panel selesai diperbarui');
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      }
    };
    const element = (id: string) => {
      const el = container.querySelector(`[data-testid="${id}"]`);
      assert.ok(el);
      return el as unknown as HTMLInputElement;
    };
    const input = async (value: string) => act(async () => {
      const el = element('input-analysis-pages');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    });
    const loadImages = async () => act(async () => {
      for (const image of container.querySelectorAll('[data-testid="analysis-preview-image"]'))
        image.dispatchEvent(new window.Event('load'));
    });
    const preview = async () => {
      await act(async () => element('button-preview-analysis').click());
      await wait(() => !!container.querySelector('[data-testid="analysis-preview"]'));
      // Happy DOM emits load synchronously for data URLs; a real browser
      // verifies decoding in the browser regression.
      await loadImages();
      assert.equal(element('checkbox-analysis-consent').disabled, false);
    };
    await render('first');
    await wait(() => container.textContent!.includes('40 halaman'));
    assert.equal(requests.length, 0);
    assert.equal(element('checkbox-analysis-consent').disabled, true);
    await input('2-3, 18');
    assert.equal(element('checkbox-analysis-consent').disabled, true, 'preview required before paid consent');
    await preview();
    assert.deepEqual(previews[0], { pages: [2, 3, 18], sourceRevision: 'a'.repeat(64) });
    assert.equal(requests.length, 0, 'preview never runs AI analysis');
    assert.match(container.textContent!, /Halaman kirim 3 → halaman asli 18/);
    assert.match(container.textContent!, /synthetic-model/);
    assert.match(container.textContent!, /Kredit Replit/);
    assert.match(container.textContent!, /tidak ada integrasi Gustafta/);
    await act(async () => element('checkbox-analysis-consent').click());
    assert.equal(element('button-run-analysis').disabled, false, '8 MiB PDF original does not block bounded selection');
    await input('2-3, 19');
    assert.equal(element('checkbox-analysis-consent').checked, false, 'changing selection revokes consent');
    assert.equal(container.querySelector('[data-testid="analysis-preview"]'), null);
    assert.equal(element('button-run-analysis').disabled, true);
    await input('2-3, 18');
    assert.equal(element('checkbox-analysis-consent').disabled, true, 'returning to old selection does not restore preview');
    delayPreview = true;
    await act(async () => element('button-preview-analysis').click());
    await wait(() => !!releasePreview);
    await input('2-3, 19');
    await act(async () => { releasePreview!(); });
    assert.equal(container.querySelector('[data-testid="analysis-preview"]'), null, 'late preview is discarded');
    assert.equal(element('checkbox-analysis-consent').disabled, true);
    delayPreview = false;
    await input('1-11');
    assert.equal(element('checkbox-analysis-consent').disabled, true);
    await input('19, 2-3');
    failPreview = true;
    await act(async () => element('button-preview-analysis').click());
    await wait(() => container.textContent!.includes('Pratinjau belum dapat dibuat.'));
    assert.equal(element('checkbox-analysis-consent').disabled, true);
    failPreview = false;
    await preview();
    await act(async () => container.querySelector('[data-testid="analysis-preview-image"]')!.dispatchEvent(new window.Event('error')));
    assert.equal(element('checkbox-analysis-consent').disabled, true, 'unreadable images block consent');
    await preview();
    await act(async () => element('checkbox-analysis-consent').click());
    await act(async () => element('button-run-analysis').click());
    await wait(() => !!container.querySelector('[data-testid="analysis-result"]'));
    assert.deepEqual(requests, [{ consent: true, focus: 'kesiapan_sbu', pages: [19, 2, 3], sourceRevision: 'a'.repeat(64) }]);
    assert.match(container.textContent!, /1 → 19; 2 → 2; 3 → 3/);
    await render('reopened');
    await wait(() => !!container.querySelector('[data-testid="analysis-result"]'));
    assert.match(container.textContent!, /Snapshot versi 3, 40 halaman asli/);
    assert.match(container.textContent!, /1 → 19; 2 → 2; 3 → 3/);
    assert.equal(element('checkbox-analysis-consent').checked, false);
    await input('1');
    await preview();
    await act(async () => element('checkbox-analysis-consent').click());
    assert.equal(element('button-run-analysis').disabled, false);
    doc.version = 4;
    await render('reopened');
    assert.equal(container.querySelector('[data-testid="analysis-preview"]'), null, 'document version invalidates visible preview immediately');
    assert.equal(element('checkbox-analysis-consent').checked, false);
    assert.equal(element('button-run-analysis').disabled, true);
    // Refresh source data without remounting the form.
    await act(async () => {
      for (const client of clients) await client.invalidateQueries({ queryKey: ['/api/cases/1/documents/' + doc.id + '/analysis-source'] });
    });
    await wait(() => !element('button-preview-analysis').disabled);
    await preview();
    assert.equal(element('checkbox-analysis-consent').checked, false, 'new version requires fresh consent');
    assert.equal(requests.length, 1);
  } finally {
    await act(async () => root.unmount());
    for (const client of clients) client.clear();
    await server.close(); await window.happyDOM.close(); container.remove();
    globals.window = previous.window; globals.document = previous.document; globals.fetch = previous.fetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
  }
});
