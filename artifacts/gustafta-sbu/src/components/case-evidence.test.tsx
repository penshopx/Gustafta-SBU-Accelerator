import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListEvidenceQueryKey, type Evidence } from '@workspace/api-client-react';
import { CaseEvidence } from './case-evidence';

test('mengedit bukti terbawah langsung memindahkan kartu ke atas dan memperbarui catatan', async () => {
  const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalFetch = globalThis.fetch;
  const originalWindow = testGlobals.window;
  const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
  testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
  const requests: string[] = [];
  let rows: Evidence[] = [
    { id: 11, caseId: 7, code: 'legalitas', title: 'Bukti awal', note: 'Catatan awal', updatedAt: '2026-09-25T12:00:00Z' },
    { id: 12, caseId: 7, code: 'tenaga', title: 'Bukti lama', note: 'Catatan lama', updatedAt: '2026-09-24T12:00:00Z' },
  ];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${path}`);
    assert.match(path, /\/api\/cases\/7\/evidence/);
    if (method === 'PATCH') {
      assert.match(path, /\/12$/);
      const data = JSON.parse(String(init?.body)) as { title: string; note: string };
      rows = [{ ...rows[1], ...data, updatedAt: '2026-09-26T12:00:00Z' }, rows[0]];
      return Response.json(rows[0]);
    }
    assert.equal(method, 'GET');
    return Response.json(rows);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
        createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' })));
    });
    const cards = () => renderer!.root.findAll(node => typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'));
    assert.deepEqual(cards().map(card => card.props['data-testid']), ['card-evidence-11', 'card-evidence-12']);
    await act(async () => {
      renderer!.root.findByProps({ 'data-testid': 'button-edit-evidence-12' }).props.onClick();
    });
    await act(async () => {
      renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.onChange({ target: { value: 'Catatan terbaru' } });
    });
    await act(async () => {
      renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} });
    });
    assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0, 'dialog ditutup setelah berhasil');
    assert.deepEqual(cards().map(card => card.props['data-testid']), ['card-evidence-12', 'card-evidence-11']);
    assert.ok(cards()[0].findAllByType('p').some(p => p.children.includes('Catatan terbaru')));
    assert.deepEqual(requests.map(request => request.split(' ')[0]), ['GET', 'PATCH', 'GET']);
    assert.equal(client.getQueryData<Evidence[]>(getListEvidenceQueryKey(7))?.[0].id, 12);
  } finally {
    await act(async () => { renderer?.unmount(); });
    client.clear();
    globalThis.fetch = originalFetch;
    testGlobals.window = originalWindow;
    testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});