import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListEvidenceQueryKey, getGetAssessmentQueryKey, useGetAssessment, type Assessment, type Evidence } from '@workspace/api-client-react';
import { CaseEvidence } from './case-evidence';

test('tanggal pembaruan kartu bukti mengikuti zona waktu penonton', () => {
  const expectedByZone: Record<string, string[]> = {
    UTC: ['1 Jan 2027', '31 Des 2026', '31 Des 2026', '31 Des 2026', '1 Jan 2027'],
    'America/Los_Angeles': ['31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026'],
    'Asia/Jakarta': ['1 Jan 2027', '1 Jan 2027', '31 Des 2026', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Tokyo': ['1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027'],
  };
  if (!process.env.EVIDENCE_TZ_CHILD) {
    // A fresh process constructs the local formatter after TZ has been set.
    for (const tz of Object.keys(expectedByZone)) {
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', '--test',
        '--test-name-pattern', 'tanggal pembaruan kartu bukti mengikuti zona waktu',
        fileURLToPath(import.meta.url),
      ], {
        env: { ...process.env, TZ: tz, EVIDENCE_TZ_CHILD: '1' },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${tz}: ${result.stdout}\n${result.stderr}`);
    }
    return;
  }

  const zone = process.env.TZ!;
  assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone, zone);
  const expected = expectedByZone[zone];
  assert.ok(expected, `zona pengujian dikenal: ${zone}`);
  // Evidence's API contract has no createdAt. Include a distinct extra value
  // to catch an accidental fallback to a creation timestamp at runtime.
  const rows: (Evidence & { createdAt: string })[] = [
    '2027-01-01T00:30:00.000Z',
    '2026-12-31T23:30:00.000Z',
    '2026-12-31T16:30:00.000Z',
    '2026-12-31T17:30:00.000Z',
    '2027-01-01T07:30:00.000+07:00',
  ].map((updatedAt, index) => ({
    id: index + 1, caseId: 7, code: 'legalitas',
    title: `Bukti ${index + 1}`, note: 'Catatan pengguna',
    createdAt: '2026-08-01T12:00:00.000Z', updatedAt,
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(getListEvidenceQueryKey(7), rows);
  try {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'perpanjangan', qualification: 'kecil' })));
    assert.equal(html.match(/data-testid="card-evidence-\d+"/g)?.length, rows.length);
    for (const [index, row] of rows.entries()) {
      const card = html.match(new RegExp(
        `data-testid="card-evidence-${row.id}"[\\s\\S]*?<p[^>]*>Diperbarui ([^<]*)</p>`,
      ));
      assert.ok(card, `kartu bukti ${row.id} tampil di ${zone}`);
      assert.equal(card[1], `${expected[index]} · Dideklarasikan pengguna`,
        `${row.updatedAt} di ${zone}`);
    }
    assert.doesNotMatch(html, /Diperbarui 1 Agu 2026/);
  } finally {
    client.clear();
  }
});

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
  test(`edit bukti gagal (${status}) menjaga data lama lalu berhasil setelah ${status === 422 ? 'isian diperbaiki' : 'isian dipertahankan'}`, async () => {
    const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
    const originalFetch = globalThis.fetch;
    const originalWindow = testGlobals.window;
    const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
    let rows: Evidence[] = [
      { id: 11, caseId: 7, code: 'legalitas', title: 'Bukti awal', note: 'Catatan awal', updatedAt: '2026-09-25T12:00:00Z' },
      { id: 12, caseId: 7, code: 'tenaga', title: 'Bukti lama', note: 'Catatan lama', updatedAt: '2026-09-24T12:00:00Z' },
    ];
    const originalRows = [...rows];
    const oldAssessment: Assessment = {
      caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
      recordedCount: 2, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
      findings: [{
        code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'tercatat',
        detail: 'Catatan lama', source: 'Deklarasi pengguna',
      }],
    };
    const savedEvidence: Evidence = {
      ...rows[1], title: 'Judul dari server', note: 'Catatan berhasil dari server',
      updatedAt: '2026-09-26T12:00:00Z',
    };
    const newAssessment: Assessment = {
      ...oldAssessment,
      findings: [{ ...oldAssessment.findings[0], detail: savedEvidence.note! }],
    };
    let assessment = oldAssessment;
    const draft = { title: 'Judul terbaru', note: 'Catatan terbaru' };
    const retryDraft = status === 422
      ? { title: 'Judul diperbaiki', note: 'Catatan diperbaiki' }
      : draft;
    const requests: string[] = [];
    const message = 'Perubahan bukti belum dapat disimpan.';
    let patchCount = 0;
    let rejectPatch!: () => void;
    const patchResponse = new Promise<Response>(resolve => {
      rejectPatch = () => resolve(Response.json({ error: message }, { status }));
    });
    let resolveRetry!: () => void;
    const retryResponse = new Promise<Response>(resolve => {
      resolveRetry = () => {
        rows = [savedEvidence, originalRows[0]];
        assessment = newAssessment;
        resolve(Response.json(savedEvidence));
      };
    });
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      requests.push(`${method} ${path}`);
      if (path.endsWith('/api/cases/7/assessment')) {
        assert.equal(method, 'GET');
        return Response.json(assessment);
      }
      assert.match(path, /\/api\/cases\/7\/evidence/);
      if (method === 'PATCH') {
        assert.match(path, /\/12$/);
        patchCount++;
        assert.ok(patchCount <= 2, 'hanya dua PATCH yang diminta pengguna');
        assert.deepEqual(JSON.parse(String(init?.body)), patchCount === 1 ? draft : retryDraft);
        return patchCount === 1 ? patchResponse : retryResponse;
      }
      assert.equal(method, 'GET');
      return Response.json(rows);
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const evidenceKey = getListEvidenceQueryKey(7);
    const assessmentKey = getGetAssessmentQueryKey(7);
    client.setQueryData(assessmentKey, oldAssessment);
    function AssessmentView() {
      const result = useGetAssessment(7, { query: { queryKey: assessmentKey, staleTime: Infinity } });
      return createElement('p', { 'data-testid': 'assessment-detail' }, result.data?.findings[0]?.detail);
    }
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
          createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' }),
          createElement(AssessmentView)));
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
      assert.deepEqual(client.getQueryData(assessmentKey), oldAssessment);
      assert.deepEqual(renderer!.root.findByProps({ 'data-testid': 'assessment-detail' }).children, ['Catatan lama']);
      assert.deepEqual(requests.map(request => request.split(' ')[0]), ['GET', 'PATCH'], 'kegagalan tidak memicu pembacaan ulang');
      if (status === 422) {
        await act(async () => {
          renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.onChange({ target: { value: retryDraft.title } });
          renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.onChange({ target: { value: retryDraft.note } });
        });
      }
      await act(async () => {
        renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} });
      });
      await waitForRender(() => patchCount === 2
        && renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === true);
      assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'kesalahan pertama hilang saat mencoba lagi');
      assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 1, 'dialog tetap terbuka saat PATCH kedua berlangsung');
      assert.equal(renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, retryDraft.title);
      assert.equal(renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.value, retryDraft.note);
      assert.deepEqual(cardSnapshot(), originalCards, 'isian percobaan ulang belum mengganti kartu');
      assert.deepEqual(client.getQueryData(evidenceKey), originalRows);
      assert.deepEqual(client.getQueryData(assessmentKey), oldAssessment);
      await act(async () => { resolveRetry(); });
      await waitForRender(() => renderer!.root.findAllByProps({ role: 'dialog' }).length === 0
        && cards()[0]?.findByType('h3').children.includes(savedEvidence.title)
        && renderer!.root.findByProps({ 'data-testid': 'assessment-detail' }).children.includes(savedEvidence.note!));
      assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'kesalahan tidak kembali setelah berhasil');
      assert.deepEqual(cards().map(card => card.props['data-testid']), ['card-evidence-12', 'card-evidence-11']);
      assert.deepEqual(cards()[0].findByType('h3').children, [savedEvidence.title]);
      assert.deepEqual(cards()[0].findAllByType('p')[0].children, [savedEvidence.note], 'catatan mengikuti server, bukan draf');
      assert.deepEqual(cardSnapshot()[1], originalCards[0], 'bukti lain tetap utuh');
      assert.deepEqual(client.getQueryData(evidenceKey), [savedEvidence, originalRows[0]]);
      assert.deepEqual(client.getQueryData(assessmentKey), newAssessment, 'penilaian aktif dimuat ulang setelah berhasil');
      assert.equal(client.getQueryState(assessmentKey)?.isInvalidated, false);
      assert.equal(patchCount, 2);
      assert.deepEqual(requests.slice(0, 3).map(request => request.split(' ')[0]), ['GET', 'PATCH', 'PATCH']);
      assert.deepEqual(requests.slice(3).sort(), [
        'GET /api/cases/7/assessment', 'GET /api/cases/7/evidence',
      ], 'keberhasilan memuat ulang bukti dan penilaian tepat sekali');
    } finally {
      await act(async () => { renderer?.unmount(); });
      client.clear();
      globalThis.fetch = originalFetch;
      testGlobals.window = originalWindow;
      testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    }
  });
}

for (const status of [422, 500]) {
  test(`hapus bukti gagal (${status}) mempertahankan dialog, kartu, catatan, dan cache saat dicoba ulang`, async (t) => {
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
    const assessment: Assessment = {
      caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
      recordedCount: 2, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
      findings: [{
        code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'tercatat',
        detail: 'Catatan lama', source: 'Deklarasi pengguna',
      }],
    };
    const requests: string[] = [];
    const message = 'Catatan bukti belum dapat dihapus.';
    let deleteCount = 0;
    let failDelete!: () => void;
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      requests.push(`${method} ${path}`);
      if (path.endsWith('/api/cases/7/assessment')) {
        assert.equal(method, 'GET');
        return Response.json(assessment);
      }
      if (method === 'DELETE') {
        assert.equal(path, '/api/cases/7/evidence/12', 'percobaan ulang tetap menghapus bukti yang dikonfirmasi');
        deleteCount++;
        assert.ok(deleteCount <= 2, 'tidak ada percobaan ulang otomatis');
        return new Promise<Response>(resolve => {
          failDelete = () => resolve(Response.json({ error: message }, { status }));
        });
      }
      assert.equal(method, 'GET');
      assert.equal(path, '/api/cases/7/evidence');
      return Response.json(rows);
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const evidenceKey = getListEvidenceQueryKey(7);
    const assessmentKey = getGetAssessmentQueryKey(7);
    client.setQueryData(assessmentKey, assessment);
    const invalidate = t.mock.method(client, 'invalidateQueries');
    function AssessmentView() {
      const result = useGetAssessment(7, { query: { queryKey: assessmentKey, staleTime: Infinity } });
      return createElement('p', { 'data-testid': 'assessment-detail' }, result.data?.findings[0]?.detail);
    }
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
          createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' }),
          createElement(AssessmentView)));
      });
      const cards = () => renderer!.root.findAll(node => typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'));
      await waitForRender(() => cards().length === 2);
      const cardSnapshot = () => cards().map(card => ({
        id: card.props['data-testid'],
        category: card.findByType('span').children,
        title: card.findByType('h3').children,
        paragraphs: card.findAllByType('p').map(p => p.children),
      }));
      const originalCards = cardSnapshot();
      assert.deepEqual(cards().map(card => card.props['data-testid']), ['card-evidence-11', 'card-evidence-12']);
      const assertUnchanged = () => {
        assert.deepEqual(cardSnapshot(), originalCards, 'semua kartu, urutan, kategori, judul, catatan, dan tanggal tetap utuh');
        assert.deepEqual(client.getQueryData(evidenceKey), rows);
        assert.deepEqual(client.getQueryData(assessmentKey), assessment);
        assert.equal(client.getQueryState(evidenceKey)?.isInvalidated, false);
        assert.equal(client.getQueryState(assessmentKey)?.isInvalidated, false);
        assert.equal(invalidate.mock.callCount(), 0, 'kegagalan tidak memanggil invalidasi, termasuk invalidasi yang langsung selesai');
        assert.deepEqual(renderer!.root.findByProps({ 'data-testid': 'assessment-detail' }).children, ['Catatan lama']);
      };
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'button-delete-evidence-12' }).props.onClick();
      });
      for (let attempt = 1; attempt <= 2; attempt++) {
        await act(async () => {
          renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.onClick();
        });
        await waitForRender(() => deleteCount === attempt
          && renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled === true);
        assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'pesan kesalahan lama hilang saat dicoba ulang');
        assert.equal(renderer!.root.findByProps({ role: 'dialog' }).props['aria-label'], 'Hapus catatan bukti?');
        assertUnchanged();
        await act(async () => { failDelete(); });
        await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1
          && renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled === false);
        const dialog = renderer!.root.findByProps({ role: 'dialog' });
        assert.equal(dialog.props['aria-label'], 'Hapus catatan bukti?', 'dialog konfirmasi tetap terbuka setelah gagal');
        assert.ok(dialog.findByProps({ role: 'alert' }).children.some(child => typeof child === 'string' && child.includes(message)));
        assert.equal(dialog.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled, false, 'tombol hapus dapat dipakai kembali');
        assert.notEqual(dialog.findByProps({ 'data-testid': 'button-cancel-delete' }).props.disabled, true, 'tombol batal tetap dapat dipakai');
        assertUnchanged();
        assert.deepEqual(requests, [
          'GET /api/cases/7/evidence',
          ...Array.from({ length: attempt }, () => 'DELETE /api/cases/7/evidence/12'),
        ], 'kegagalan tidak memicu pembacaan ulang daftar maupun penilaian');
      }
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'button-cancel-delete' }).props.onClick();
      });
      assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0, 'pengguna tetap dapat membatalkan setelah gagal');
      assertUnchanged();
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