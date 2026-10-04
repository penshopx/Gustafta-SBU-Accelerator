import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListEvidenceQueryKey, getGetAssessmentQueryKey, type Evidence } from '@workspace/api-client-react';
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

for (const status of [422, 500]) {
  test(`edit bukti gagal (${status}) mempertahankan formulir, urutan kartu, dan catatan lama`, async () => {
    const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
    const originalFetch = globalThis.fetch;
    const originalWindow = testGlobals.window;
    const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
    const rows: Evidence[] = [
      { id: 11, caseId: 7, code: 'legalitas', title: 'Bukti awal', note: 'Catatan awal', updatedAt: '2026-09-25T12:00:00Z' },
      { id: 12, caseId: 7, code: 'tenaga', title: 'Bukti lama', note: 'Catatan lama', updatedAt: '2026-09-24T12:00:00Z' },
    ];
    const requests: string[] = [];
    const message = 'Perubahan bukti belum dapat disimpan.';
    let rejectPatch!: () => void;
    const patchResponse = new Promise<Response>(resolve => {
      rejectPatch = () => resolve(Response.json({ error: message }, { status }));
    });
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      requests.push(`${method} ${path}`);
      assert.match(path, /\/api\/cases\/7\/evidence/);
      if (method === 'PATCH') {
        assert.match(path, /\/12$/);
        assert.deepEqual(JSON.parse(String(init?.body)), { title: 'Judul terbaru', note: 'Catatan terbaru' });
        return patchResponse;
      }
      assert.equal(method, 'GET');
      return Response.json(rows);
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const evidenceKey = getListEvidenceQueryKey(7);
    const assessmentKey = getGetAssessmentQueryKey(7);
    client.setQueryData(assessmentKey, { marker: 'penilaian lama' });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    const waitForRender = async (ready: () => boolean) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (ready()) return;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      }
      assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
    };
    try {
      await act(async () => {
        renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
          createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' })));
      });
      const cards = () => renderer!.root.findAll(node => typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'));
      await waitForRender(() => cards().length === 2);
      const cardSnapshot = () => cards().map(card => ({
        id: card.props['data-testid'],
        title: card.findByType('h3').children,
        paragraphs: card.findAllByType('p').map(p => p.children),
      }));
      const originalCards = cardSnapshot();
      assert.deepEqual(cards().map(card => card.props['data-testid']), ['card-evidence-11', 'card-evidence-12']);
      assert.deepEqual(client.getQueryData(evidenceKey), rows);
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'button-edit-evidence-12' }).props.onClick();
      });
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.onChange({ target: { value: 'Judul terbaru' } });
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.onChange({ target: { value: 'Catatan terbaru' } });
      });
      await act(async () => {
        renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} });
      });
      await waitForRender(() => renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === true);
      assert.equal(renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled, true);
      assert.deepEqual(cardSnapshot(), originalCards, 'kartu tidak berubah saat PATCH masih berlangsung');
      await act(async () => { rejectPatch(); });
      await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1);
      const dialog = renderer!.root.findByProps({ role: 'dialog' });
      assert.equal(dialog.props['aria-label'], 'Ubah catatan bukti');
      assert.ok(dialog.findByProps({ role: 'alert' }).children.some(child => typeof child === 'string' && child.includes(message)));
      assert.equal(dialog.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, 'Judul terbaru');
      assert.equal(dialog.findByProps({ 'data-testid': 'input-evidence-note' }).props.value, 'Catatan terbaru');
      assert.equal(dialog.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled, false, 'pengguna dapat mencoba menyimpan lagi');
      assert.deepEqual(cardSnapshot(), originalCards, 'urutan, judul, catatan, dan tanggal kartu lama tetap utuh');
      assert.deepEqual(client.getQueryData(evidenceKey), rows, 'cache bukti tidak diganti oleh isian yang gagal');
      assert.equal(client.getQueryState(evidenceKey)?.isInvalidated, false);
      assert.equal(client.getQueryState(assessmentKey)?.isInvalidated, false);
      assert.deepEqual(requests.map(request => request.split(' ')[0]), ['GET', 'PATCH'], 'kegagalan tidak memicu pembacaan ulang');
    } finally {
      await act(async () => { renderer?.unmount(); });
      client.clear();
      globalThis.fetch = originalFetch;
      testGlobals.window = originalWindow;
      testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    }
  });
}

test('aksi dari rencana membuka formulir dengan kategori yang disarankan dan menyimpannya', async () => {
  const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalFetch = globalThis.fetch;
  const originalWindow = testGlobals.window;
  const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
  testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
  const posted: { code: string; title: string }[] = [];
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { code: string; title: string };
      posted.push(body);
      return Response.json({ id: 22, caseId: 7, ...body, note: '', updatedAt: '2026-09-26T12:00:00Z' }, { status: 201 });
    }
    return Response.json(posted.map((body) => ({ id: 22, caseId: 7, ...body, note: '', updatedAt: '2026-09-26T12:00:00Z' })));
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  let closeCount = 0;
  try {
    await act(async () => {
      renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
        createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil',
          suggestion: 'legalitas', onSuggestionClose: () => { closeCount++; } })));
    });
    assert.equal(renderer!.root.findByProps({ 'data-testid': 'select-evidence-code' }).props.value, 'legalitas');
    assert.equal(renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, 'Legalitas dan identitas badan usaha');
    await act(async () => { renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.equal(posted[0]?.code, 'legalitas');
    assert.equal(closeCount, 1);
    assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
  } finally {
    await act(async () => { renderer?.unmount(); });
    client.clear();
    globalThis.fetch = originalFetch;
    testGlobals.window = originalWindow;
    testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});