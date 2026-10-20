import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ReviewPreview, ReviewRecord, ReviewSnapshot } from '@workspace/api-client-react';

test('tinjauan internal mengikat konfirmasi ke snapshot, menolak konflik tanpa replay dan menampilkan riwayat lama', async () => {
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
  const itemId = '11111111-1111-4111-8111-111111111111';
  const recordId = '22222222-2222-4222-8222-222222222222';
  const timestamp = '2026-10-20T01:00:00Z';
  let snapshot: ReviewSnapshot = {
    schemaVersion: 'review-v1',
    case: { id: 1, companyName: 'Kasus fixture', classification: 'Gedung', qualification: 'Kecil',
      requestType: 'baru', status: 'draf', existingSbuExpiresOn: null, updatedAt: timestamp },
    workroomItems: [{ id: itemId, caseId: 1, kind: 'checklist', title: 'Bahan terpilih', body: 'Isi awal',
      status: 'done', assignee: '', dueOn: null, revision: 0, createdAt: timestamp, updatedAt: timestamp }],
    evidence: [], documents: [],
  };
  let hash = 'a'.repeat(64);
  let records: ReviewRecord[] = [];
  let conflict = true;
  const submissions: Record<string, unknown>[] = [];
  try {
    const { CaseWorkroomReviews } = await server.ssrLoadModule('/src/components/case-workroom-reviews.tsx');
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx');
    function Harness() {
      const client = useQueryClient();
      clients.add(client);
      client.setDefaultOptions({ queries: { gcTime: 0, retry: false }, mutations: { gcTime: 0 } });
      return createElement(CaseWorkroomReviews, { caseId: 1, expectedUserId: 'owner-a' });
    }
    globals.fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get('X-SBU-Form-Owner'), 'owner-a');
      const path = String(url);
      assert.match(path, /\/cases\/1\/workroom\/reviews(?:\/preview)?$/);
      if (init?.method !== 'POST') return Response.json({
        caseId: 1, materials: snapshot, reviews: records, historyTruncated: false,
      });
      const body = JSON.parse(String(init.body));
      if (path.endsWith('/preview')) return Response.json({
        selection: body, snapshot, snapshotHash: hash, latestReviewId: records[0]?.id ?? null,
      } satisfies ReviewPreview);
      submissions.push(body);
      if (conflict) return Response.json({ error: 'Bahan berubah' }, { status: 409 });
      records = [{
        id: recordId, caseId: 1, sequenceNo: 1, decision: body.decision, note: body.note,
        selection: body.selection, snapshot: structuredClone(snapshot), snapshotHash: hash,
        decidedAt: timestamp, current: true,
      }];
      return Response.json(records[0], { status: 201 });
    };
    const element = (id: string) => {
      const el = container.querySelector(`[data-testid="${id}"]`);
      assert.ok(el, id);
      return el as unknown as HTMLInputElement;
    };
    const wait = async (fn: () => boolean) => {
      const until = Date.now() + 3000;
      while (!fn()) {
        assert.ok(Date.now() < until, 'UI tinjauan selesai diperbarui');
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      }
    };
    const click = async (id: string) => act(async () => { element(id).click(); });
    await act(async () => root.render(createElement(AccountQueries, { userId: 'owner-a', children: createElement(Harness) })));
    await wait(() => !!container.querySelector(`[data-testid="checkbox-review-workroom-${itemId}"]`));
    assert.match(element('text-review-disclaimer').textContent!, /bukan persetujuan LSBU\/OSS/);
    assert.equal(element('button-review-preview').disabled, true);
    await click(`checkbox-review-workroom-${itemId}`);
    await click('button-review-preview');
    await wait(() => !!container.querySelector('[data-testid="dialog-review-preview"]'));
    assert.match(element('review-preview').textContent!, /Isi awal/);
    assert.match(element('text-review-preview-version').textContent!, new RegExp(hash));
    assert.equal(element('button-review-save').disabled, true);
    await click('button-review-decision-approved');
    await act(async () => {
      const el = element('input-review-note');
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(el, 'Diperiksa pemilik');
      el.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    });
    assert.equal(element('button-review-save').disabled, true, 'catatan dan keputusan tidak menggantikan konfirmasi');
    await click('checkbox-review-confirm');
    await click('button-review-save');
    await wait(() => !!container.querySelector('[data-testid="text-review-conflict"]'));
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].snapshotHash, 'a'.repeat(64));
    assert.equal(submissions[0].confirmed, true);
    assert.equal(element('input-review-note').value, 'Diperiksa pemilik');
    assert.equal(element('button-review-save').disabled, true);
    snapshot = { ...snapshot, workroomItems: snapshot.workroomItems.map(i => ({ ...i, body: 'Isi diperbarui', revision: 1 })) };
    hash = 'b'.repeat(64);
    conflict = false;
    await click('button-review-refresh-preview');
    await wait(() => element('review-preview').textContent!.includes('Isi diperbarui'));
    assert.equal(element('checkbox-review-confirm').checked, false, 'versi baru wajib dikonfirmasi ulang');
    assert.equal(element('input-review-note').value, 'Diperiksa pemilik');
    assert.equal(submissions.length, 1, 'tidak ada pengiriman ulang otomatis');
    await click('button-review-decision-needs_changes');
    await click('checkbox-review-confirm');
    await click('button-review-save');
    await wait(() => !!container.querySelector(`[data-testid="card-review-${recordId}"]`));
    assert.equal(submissions.length, 2);
    assert.equal(submissions[1].snapshotHash, hash);
    assert.equal(submissions[1].decision, 'needs_changes');
    assert.match(element(`text-review-decision-${recordId}`).textContent!, /Perlu perbaikan/);
    assert.match(element(`status-review-current-${recordId}`).textContent!, /tidak berubah/);
    records = records.map(r => ({ ...r, current: false }));
    snapshot = { ...snapshot, workroomItems: snapshot.workroomItems.map(i => ({ ...i, body: 'Isi revisi berikutnya', revision: 2 })) };
    await click('button-review-reload');
    await wait(() => element(`status-review-current-${recordId}`).textContent!.includes('Perlu tinjau ulang'));
    await click(`button-review-open-${recordId}`);
    assert.match(element('review-history').textContent!, /Isi diperbarui/);
    assert.doesNotMatch(element('review-history').textContent!, /Isi revisi berikutnya/);
    await click('button-review-snapshot-close');
    await act(async () => root.render(createElement(AccountQueries, { userId: 'owner-b', children: null })));
    assert.equal(container.textContent, '', 'UI akun lama dibuang saat akun berubah');
  } finally {
    await act(async () => root.unmount());
    for (const client of clients) client.clear();
    await server.close();
    await window.happyDOM.close();
    globals.window = previous.window; globals.document = previous.document; globals.fetch = previous.fetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
  }
});
