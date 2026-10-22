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

test('kartu bukti tetap terbaca saat timestamp pembaruan kosong atau rusak', () => {
  const rows = ['', 'bukan-tanggal', '2026-13-01T00:00:00Z'].map((updatedAt, index) => ({
    id: index + 1, caseId: 7, code: 'legalitas',
    title: `Bukti ${index + 1}`, note: 'Catatan tetap terbaca',
    createdAt: '2026-08-01T12:00:00.000Z', updatedAt,
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(getListEvidenceQueryKey(7), rows);
  try {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'perpanjangan', qualification: 'kecil' })));
    for (const [index, row] of rows.entries()) {
      const card = html.match(new RegExp(
        `data-testid="card-evidence-${row.id}"[\\s\\S]*?<p[^>]*>Diperbarui ([^<]*)</p>`,
      ));
      assert.ok(card, `kartu ${row.id} tetap tampil`);
      assert.equal(card[1], `${index === 0 ? '—' : 'Tanggal tidak valid'} · Dideklarasikan pengguna`);
      assert.ok(html.includes(row.title));
    }
    assert.match(html, /Catatan tetap terbaca/);
    assert.doesNotMatch(html, /Invalid Date|1 Jan 1970|Diperbarui 1 Agu 2026/);
  } finally {
    client.clear();
  }
});

test('tanggal pembaruan kartu bukti mengikuti zona waktu penonton', () => {
  // Literal LA dates, with each instant represented in Z, -08:00, and -07:00.
  // Fixed offsets remain valid even when that offset is not active in LA.
  const dstOffsetCases = [
    ['7 Mar 2026', '2026-03-08T07:30:00.000Z', '2026-03-07T23:30:00.000-08:00', '2026-03-08T00:30:00.000-07:00'],
    ['8 Mar 2026', '2026-03-08T08:30:00.000Z', '2026-03-08T00:30:00.000-08:00', '2026-03-08T01:30:00.000-07:00'],
    // The spring jump from 01:59:59.999 PST to 03:00 PDT.
    ['8 Mar 2026', '2026-03-08T09:59:59.999Z', '2026-03-08T01:59:59.999-08:00', '2026-03-08T02:59:59.999-07:00'],
    ['8 Mar 2026', '2026-03-08T10:00:00.000Z', '2026-03-08T02:00:00.000-08:00', '2026-03-08T03:00:00.000-07:00'],
    ['8 Mar 2026', '2026-03-09T06:30:00.000Z', '2026-03-08T22:30:00.000-08:00', '2026-03-08T23:30:00.000-07:00'],
    ['9 Mar 2026', '2026-03-09T07:30:00.000Z', '2026-03-08T23:30:00.000-08:00', '2026-03-09T00:30:00.000-07:00'],
    ['31 Okt 2026', '2026-11-01T06:30:00.000Z', '2026-10-31T22:30:00.000-08:00', '2026-10-31T23:30:00.000-07:00'],
    ['1 Nov 2026', '2026-11-01T07:30:00.000Z', '2026-10-31T23:30:00.000-08:00', '2026-11-01T00:30:00.000-07:00'],
    // Two different instants share the local 01:30 wall clock: PDT, then PST.
    ['1 Nov 2026', '2026-11-01T08:30:00.000Z', '2026-11-01T00:30:00.000-08:00', '2026-11-01T01:30:00.000-07:00'],
    ['1 Nov 2026', '2026-11-01T09:30:00.000Z', '2026-11-01T01:30:00.000-08:00', '2026-11-01T02:30:00.000-07:00'],
    ['1 Nov 2026', '2026-11-02T07:30:00.000Z', '2026-11-01T23:30:00.000-08:00', '2026-11-02T00:30:00.000-07:00'],
    ['2 Nov 2026', '2026-11-02T08:30:00.000Z', '2026-11-02T00:30:00.000-08:00', '2026-11-02T01:30:00.000-07:00'],
  ] as const;
  for (const [, utc, standard, daylight] of dstOffsetCases) {
    assert.equal(Date.parse(standard), Date.parse(utc), `${standard} harus setara dengan ${utc}`);
    assert.equal(Date.parse(daylight), Date.parse(utc), `${daylight} harus setara dengan ${utc}`);
  }
  // Literal St_Johns dates and getTimezoneOffset minutes, independent of the formatter.
  const stJohnsCases = [
    // Summer midnight (UTC-02:30) and winter year boundary (UTC-03:30).
    ['26 Sep 2026', '2026-09-27T02:29:59.999Z', 150],
    ['27 Sep 2026', '2026-09-27T02:30:00.000Z', 150],
    ['31 Des 2026', '2027-01-01T03:29:59.999Z', 210],
    ['1 Jan 2027', '2027-01-01T03:30:00.000Z', 210],
    ['1 Jan 2027', '2027-01-01T00:00:00.000-03:30', 210],
    // March 8: midnight, jump from 01:59:59.999 NST to 03:00 NDT, next midnight.
    ['7 Mar 2026', '2026-03-08T03:29:59.999Z', 210],
    ['8 Mar 2026', '2026-03-08T03:30:00.000Z', 210],
    ['8 Mar 2026', '2026-03-08T05:29:59.999Z', 210],
    ['8 Mar 2026', '2026-03-08T05:30:00.000Z', 150],
    ['8 Mar 2026', '2026-03-08T03:00:00.000-02:30', 150],
    ['8 Mar 2026', '2026-03-09T02:29:59.999Z', 150],
    ['9 Mar 2026', '2026-03-09T02:30:00.000Z', 150],
    // November 1: midnight, rollback from 01:59:59.999 NDT to 01:00 NST, next midnight.
    ['31 Okt 2026', '2026-11-01T02:29:59.999Z', 150],
    ['1 Nov 2026', '2026-11-01T02:30:00.000Z', 150],
    ['1 Nov 2026', '2026-11-01T04:29:59.999Z', 150],
    ['1 Nov 2026', '2026-11-01T04:30:00.000Z', 210],
    ['1 Nov 2026', '2026-11-01T01:00:00.000-03:30', 210],
    ['1 Nov 2026', '2026-11-02T03:29:59.999Z', 210],
    ['2 Nov 2026', '2026-11-02T03:30:00.000Z', 210],
  ] as const;
  const expectedByZone: Record<string, string[]> = {
    UTC: ['1 Jan 2027', '31 Des 2026', '31 Des 2026', '31 Des 2026', '1 Jan 2027'],
    'America/St_Johns': [
      '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026',
      ...stJohnsCases.map(([date]) => date),
    ],
    'America/Los_Angeles': [
      '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026',
      ...dstOffsetCases.flatMap(([date]) => [date, date, date]),
    ],
    'Australia/Sydney': [
      '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027',
      '4 Apr 2026', '5 Apr 2026', '5 Apr 2026', '6 Apr 2026',
      '3 Okt 2026', '4 Okt 2026', '4 Okt 2026', '5 Okt 2026',
    ],
    'Asia/Jakarta': ['1 Jan 2027', '1 Jan 2027', '31 Des 2026', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Tokyo': ['1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Kathmandu': [
      '1 Jan 2027', '1 Jan 2027', '31 Des 2026', '31 Des 2026', '1 Jan 2027',
      '26 Sep 2026', '27 Sep 2026', '31 Des 2026', '1 Jan 2027', '1 Jan 2027',
    ],
    'Pacific/Kiritimati': [
      '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027',
      '26 Sep 2026', '27 Sep 2026', '31 Des 2026', '1 Jan 2027', '1 Jan 2027',
    ],
  };
  if (!process.env.EVIDENCE_TZ_CHILD) {
    // A fresh process constructs the local formatter after TZ has been set.
    for (const tz of Object.keys(expectedByZone)) {
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', '--test', '--test-reporter=tap',
        '--test-name-pattern', 'tanggal pembaruan kartu bukti mengikuti zona waktu',
        fileURLToPath(import.meta.url),
      ], {
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, TZ: tz, EVIDENCE_TZ_CHILD: '1' },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${tz}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /# pass 1\b/, `${tz}: uji kartu bukti harus benar-benar dijalankan`);
    }
    return;
  }

  const zone = process.env.TZ!;
  // ICU may canonicalize Asia/Kathmandu to the equivalent Asia/Katmandu.
  assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Intl.DateTimeFormat('id-ID', { timeZone: zone }).resolvedOptions().timeZone);
  const expected = expectedByZone[zone];
  assert.ok(expected, `zona pengujian dikenal: ${zone}`);
  if (zone === 'America/St_Johns') {
    for (const [, timestamp, offset] of stJohnsCases) {
      assert.equal(new Date(timestamp).getTimezoneOffset(), offset, `${timestamp}: offset St_Johns`);
    }
  }
  // Evidence's API contract has no createdAt. Include a distinct extra value
  // to catch an accidental fallback to a creation timestamp at runtime.
  const rows: (Evidence & { createdAt: string })[] = [
    '2027-01-01T00:30:00.000Z',
    '2026-12-31T23:30:00.000Z',
    '2026-12-31T16:30:00.000Z',
    '2026-12-31T17:30:00.000Z',
    '2027-01-01T07:30:00.000+07:00',
    ...(zone === 'America/St_Johns' ? stJohnsCases.map(([, timestamp]) => timestamp) : []),
    ...(zone === 'Asia/Kathmandu' ? [
      // UTC+05:45: midnight is 18:15Z.
      '2026-09-26T18:14:59.999Z', '2026-09-26T18:15:00.000Z',
      '2026-12-31T18:14:59.999Z', '2026-12-31T18:15:00.000Z',
      '2027-01-01T00:00:00.000+05:45',
    ] : []),
    ...(zone === 'Pacific/Kiritimati' ? [
      // UTC+14: midnight is 10:00Z on the preceding UTC date.
      '2026-09-26T09:59:59.999Z', '2026-09-26T10:00:00.000Z',
      '2026-12-31T09:59:59.999Z', '2026-12-31T10:00:00.000Z',
      '2027-01-01T00:00:00.000+14:00',
    ] : []),
    ...(zone === 'America/Los_Angeles'
      ? dstOffsetCases.flatMap(([, utc, standard, daylight]) => [utc, standard, daylight]) : []),
    ...(zone === 'Australia/Sydney' ? [
      // DST ends April 5 (UTC+11 -> UTC+10): midnight moves from 13:00Z to 14:00Z.
      '2026-04-04T12:59:59.999Z', '2026-04-04T13:00:00.000Z',
      '2026-04-05T13:59:59.999Z', '2026-04-05T14:00:00.000Z',
      // DST starts October 4 (UTC+10 -> UTC+11): midnight moves back to 13:00Z.
      '2026-10-03T13:59:59.999Z', '2026-10-03T14:00:00.000Z',
      '2026-10-04T12:59:59.999Z', '2026-10-04T13:00:00.000Z',
    ] : []),
  ].map((updatedAt, index) => ({
    id: index + 1, caseId: 7, code: 'legalitas',
    title: `Bukti ${index + 1}`, note: 'Catatan pengguna',
    createdAt: '2026-08-01T12:00:00.000Z', updatedAt,
  }));
  assert.equal(rows.length, expected.length);
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
  for (const [reopenId, closeMode] of [12, 11].flatMap(id =>
    ['Batal', 'Escape', 'klik latar', 'Tutup'].map(mode => [id, mode] as const))) {
    test(`membatalkan edit gagal (${status}) lewat ${closeMode} lalu membuka bukti ${reopenId === 12 ? 'yang sama' : 'lain'} mengembalikan data tersimpan tanpa kesalahan lama`, async (t) => {
      const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
      const originalFetch = globalThis.fetch;
      const originalWindow = testGlobals.window;
      const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      let renderer: TestRenderer.ReactTestRenderer | undefined;
      t.after(async () => {
        try {
          await act(async () => { renderer?.unmount(); });
        } finally {
          client.clear();
          globalThis.fetch = originalFetch;
          testGlobals.window = originalWindow;
          testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
        }
      });
      testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
      // Exercise the dialog's real keydown subscription, including effect cleanup.
      const dialogEvents = new EventTarget();
      testGlobals.window = dialogEvents as unknown as Window & typeof globalThis;
      const rows: Evidence[] = [
        { id: 11, caseId: 7, code: 'legalitas', title: 'Legalitas tersimpan', note: 'Catatan legalitas', updatedAt: '2026-09-25T12:00:00Z' },
        { id: 12, caseId: 7, code: 'tenaga', title: 'Tenaga tersimpan', note: 'Catatan tenaga', updatedAt: '2026-09-24T12:00:00Z' },
      ];
      const assessment: Assessment = {
        caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
        recordedCount: 2, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
        findings: [{
          code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'tercatat',
          detail: 'Catatan tenaga', source: 'Deklarasi pengguna',
        }],
      };
      const evidenceKey = getListEvidenceQueryKey(7);
      const assessmentKey = getGetAssessmentQueryKey(7);
      client.setQueryData(assessmentKey, assessment);
      const invalidate = t.mock.method(client, 'invalidateQueries');
      function AssessmentView() {
        const result = useGetAssessment(7, { query: { queryKey: assessmentKey, staleTime: Infinity } });
        return createElement('p', { 'data-testid': 'assessment-detail' }, result.data?.findings[0]?.detail);
      }
      const draft = { title: 'Judul draf dibatalkan', note: 'Catatan draf dibatalkan' };
      const message = 'Perubahan bukti belum dapat disimpan.';
      const requests: string[] = [];
      globalThis.fetch = async (input, init) => {
        const path = String(input);
        const method = init?.method ?? 'GET';
        requests.push(`${method} ${path}`);
        if (method === 'PATCH') {
          assert.equal(path, '/api/cases/7/evidence/12');
          assert.deepEqual(JSON.parse(String(init?.body)), draft);
          return Response.json({ error: message }, { status });
        }
        assert.equal(method, 'GET');
        assert.equal(path, '/api/cases/7/evidence');
        return Response.json(rows);
      };
      const waitForRender = async (ready: () => boolean) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (ready()) return;
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
        }
        assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
      };
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
      const assertStoredState = () => {
        assert.deepEqual(cardSnapshot(), originalCards, 'urutan, judul, catatan, dan tanggal kartu tidak diganti oleh draf');
        assert.deepEqual(client.getQueryData(evidenceKey), rows, 'cache bukti tetap memakai data tersimpan');
        assert.deepEqual(client.getQueryData(assessmentKey), assessment, 'cache penilaian tidak berubah');
        assert.deepEqual(renderer!.root.findByProps({ 'data-testid': 'assessment-detail' }).children, ['Catatan tenaga']);
        assert.equal(client.getQueryState(evidenceKey)?.isInvalidated, false);
        assert.equal(client.getQueryState(assessmentKey)?.isInvalidated, false);
        assert.equal(invalidate.mock.callCount(), 0, 'pembatalan maupun kegagalan tidak menginvalidasi bukti atau penilaian');
      };
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'button-edit-evidence-12' }).props.onClick();
      });
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.onChange({ target: { value: draft.title } });
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.onChange({ target: { value: draft.note } });
      });
      await act(async () => {
        renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} });
      });
      await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1
        && renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === false);
      const failedDialog = renderer!.root.findByProps({ role: 'dialog' });
      assert.ok(failedDialog.findByProps({ role: 'alert' }).children.some(child => typeof child === 'string' && child.includes(message)));
      assert.equal(failedDialog.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, draft.title);
      assert.equal(failedDialog.findByProps({ 'data-testid': 'input-evidence-note' }).props.value, draft.note);
      assertStoredState();
      await act(async () => {
        if (closeMode === 'Escape') {
          dialogEvents.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
        } else if (closeMode === 'klik latar') {
          const backdrop = failedDialog.parent!;
          const target = {};
          backdrop.props.onMouseDown({ target, currentTarget: target });
        } else {
          failedDialog.findByProps({
            'data-testid': closeMode === 'Tutup' ? 'button-close-dialog' : 'button-cancel-evidence',
          }).props.onClick();
        }
      });
      assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0, `${closeMode} menutup dialog gagal`);
      assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
      assertStoredState();
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': `button-edit-evidence-${reopenId}` }).props.onClick();
      });
      const reopened = renderer!.root.findByProps({ role: 'dialog' });
      const saved = rows.find(row => row.id === reopenId)!;
      assert.equal(reopened.props['aria-label'], 'Ubah catatan bukti');
      assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'pesan gagal sebelumnya tidak terbawa saat edit dibuka ulang');
      assert.equal(reopened.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, saved.title);
      assert.equal(reopened.findByProps({ 'data-testid': 'input-evidence-note' }).props.value, saved.note);
      assert.equal(reopened.findByProps({ disabled: true }).props.value, reopenId === 12
        ? 'Tenaga kerja konstruksi' : 'Legalitas dan identitas badan usaha');
      assert.equal(reopened.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled, false);
      assertStoredState();
      assert.deepEqual(requests, [
        'GET /api/cases/7/evidence', 'PATCH /api/cases/7/evidence/12',
      ], 'membatalkan dan membuka ulang tidak mengirim ulang draf atau memuat ulang penilaian');
    });
  }
}

for (const status of [422, 500, 'koneksi terputus'] as const) {
  test(`Tambah catatan setelah Batal dari edit gagal (${status}) memakai formulir bersih dan POST tanpa mengubah bukti lama`, async (t) => {
    const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
    const originalFetch = globalThis.fetch;
    const originalWindow = testGlobals.window;
    const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
    });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    t.after(async () => {
      try {
        await act(async () => { renderer?.unmount(); });
      } finally {
        client.clear();
        globalThis.fetch = originalFetch;
        testGlobals.window = originalWindow;
        testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
      }
    });
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
    const originalRows: Evidence[] = [
      { id: 11, caseId: 7, code: 'legalitas', title: 'Legalitas tersimpan', note: 'Catatan legalitas', updatedAt: '2026-09-25T12:00:00Z' },
      { id: 12, caseId: 7, code: 'tenaga', title: 'Tenaga tersimpan', note: 'Catatan tenaga', updatedAt: '2026-09-24T12:00:00Z' },
    ];
    const editDraft = { title: 'Judul edit dibatalkan', note: 'Catatan edit dibatalkan' };
    const newDraft = { code: 'peralatan', title: 'Judul bukti baru', note: 'Catatan bukti baru' };
    const savedEvidence: Evidence = {
      id: 23, caseId: 7, code: newDraft.code, title: 'Judul baru dari server',
      note: 'Catatan baru dari server', updatedAt: '2026-09-26T12:00:00Z',
    };
    const evidenceKey = getListEvidenceQueryKey(7);
    const assessmentKey = getGetAssessmentQueryKey(7);
    client.setQueryData(evidenceKey, originalRows);
    const invalidate = t.mock.method(client, 'invalidateQueries');
    let rows = originalRows;
    const requests: string[] = [];
    const message = status === 'koneksi terputus' ? 'Failed to fetch' : 'Perubahan bukti belum dapat disimpan.';
    let succeedPost!: () => void;
    const postResponse = new Promise<Response>(resolve => {
      succeedPost = () => {
        rows = [savedEvidence, ...originalRows];
        resolve(Response.json(savedEvidence, { status: 201 }));
      };
    });
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      requests.push(`${method} ${path}`);
      if (method === 'PATCH') {
        assert.equal(path, '/api/cases/7/evidence/12');
        assert.deepEqual(JSON.parse(String(init?.body)), editDraft);
        if (status === 'koneksi terputus') throw new TypeError(message);
        return Response.json({ error: message }, { status });
      }
      assert.equal(path, '/api/cases/7/evidence', 'pencatatan baru tidak memakai URL bukti yang diedit');
      if (method === 'POST') {
        assert.deepEqual(JSON.parse(String(init?.body)), newDraft, 'POST hanya membawa kategori dan isian baru');
        return postResponse;
      }
      assert.equal(method, 'GET');
      return Response.json(rows);
    };
    const waitForRender = async (ready: () => boolean) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (ready()) return;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      }
      assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
    };
    const click = async (testId: string) => {
      await act(async () => { renderer!.root.findByProps({ 'data-testid': testId }).props.onClick(); });
    };
    const submit = async () => {
      await act(async () => { renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    };
    const fillText = async (draft: { title: string; note: string }) => {
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.onChange({ target: { value: draft.title } });
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.onChange({ target: { value: draft.note } });
      });
    };
    const cardSnapshot = () => renderer!.root.findAll(node =>
      typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'))
      .map(card => ({
        id: card.props['data-testid'],
        category: card.findByType('span').children,
        title: card.findByType('h3').children,
        paragraphs: card.findAllByType('p').map(p => p.children),
      }));
    await act(async () => {
      renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
        createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' })));
    });
    const originalCards = cardSnapshot();
    assert.equal(originalCards.length, 2);
    const assertUnchanged = () => {
      assert.deepEqual(cardSnapshot(), originalCards, 'kategori, judul, catatan, tanggal, dan urutan kartu lama tetap utuh');
      assert.deepEqual(client.getQueryData(evidenceKey), originalRows);
      assert.equal(client.getQueryState(evidenceKey)?.isInvalidated, false);
      assert.equal(invalidate.mock.callCount(), 0);
    };
    await click('button-edit-evidence-12');
    assert.equal(renderer!.root.findByProps({ role: 'dialog' }).props['aria-label'], 'Ubah catatan bukti');
    await fillText(editDraft);
    await submit();
    await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1
      && renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === false);
    assert.ok(renderer!.root.findByProps({ role: 'alert' }).children.some(child => typeof child === 'string' && child.includes(message)));
    assert.equal(renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, editDraft.title);
    assert.equal(renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.value, editDraft.note);
    assertUnchanged();
    await click('button-cancel-evidence');
    assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
    assertUnchanged();
    await click('button-add-evidence');
    const dialog = renderer!.root.findByProps({ role: 'dialog' });
    assert.equal(dialog.props['aria-label'], 'Tambah catatan bukti');
    assert.equal(dialog.findByProps({ 'data-testid': 'select-evidence-code' }).props.value, '', 'kategori edit tidak terbawa');
    assert.equal(dialog.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, '');
    assert.equal(dialog.findByProps({ 'data-testid': 'input-evidence-note' }).props.value, '');
    assert.equal(dialog.findAllByProps({ role: 'alert' }).length, 0, 'kesalahan edit tidak muncul di formulir baru');
    assert.equal(dialog.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled, true);
    assertUnchanged();
    assert.deepEqual(requests, ['PATCH /api/cases/7/evidence/12'], 'Batal dan Tambah catatan tidak mengirim draf atau memuat ulang data');
    await act(async () => {
      dialog.findByProps({ 'data-testid': 'select-evidence-code' }).props.onChange({ target: { value: newDraft.code } });
    });
    await fillText(newDraft);
    await submit();
    await waitForRender(() => requests.length === 2
      && renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === true);
    assert.deepEqual(requests, ['PATCH /api/cases/7/evidence/12', 'POST /api/cases/7/evidence'],
      'pencatatan baru memakai POST, bukan PATCH terhadap bukti lama');
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
    assertUnchanged();
    await act(async () => { succeedPost(); });
    await waitForRender(() => renderer!.root.findAllByProps({ role: 'dialog' }).length === 0
      && cardSnapshot().length === 3);
    const savedCards = cardSnapshot();
    assert.deepEqual(savedCards.map(card => card.id), ['card-evidence-23', 'card-evidence-11', 'card-evidence-12']);
    assert.deepEqual(savedCards[0].category, [savedEvidence.code]);
    assert.deepEqual(savedCards[0].title, [savedEvidence.title]);
    assert.deepEqual(savedCards[0].paragraphs[0], [savedEvidence.note], 'kartu baru mengikuti respons server, bukan draf');
    assert.deepEqual(savedCards.slice(1), originalCards, 'bukti yang editnya dibatalkan dan kartu lain tidak berubah');
    assert.deepEqual(client.getQueryData(evidenceKey), [savedEvidence, ...originalRows]);
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.deepEqual(invalidate.mock.calls.map(call => call.arguments[0]), [
      { queryKey: evidenceKey }, { queryKey: assessmentKey },
    ]);
    assert.deepEqual(requests, [
      'PATCH /api/cases/7/evidence/12', 'POST /api/cases/7/evidence', 'GET /api/cases/7/evidence',
    ], 'hanya satu POST berhasil dan satu pemuatan ulang daftar tanpa PATCH tambahan');
  });
}

for (const status of [422, 500, 'koneksi terputus'] as const) {
  test(`membatalkan tambah bukti gagal (${status}) lalu membuka Tambah catatan kembali membersihkan formulir tanpa mengubah bukti dan penilaian`, async (t) => {
    const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
    const originalFetch = globalThis.fetch;
    const originalWindow = testGlobals.window;
    const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    t.after(async () => {
      try {
        await act(async () => { renderer?.unmount(); });
      } finally {
        client.clear();
        globalThis.fetch = originalFetch;
        testGlobals.window = originalWindow;
        testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
      }
    });
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
    const rows: Evidence[] = [
      { id: 11, caseId: 7, code: 'legalitas', title: 'Legalitas tersimpan', note: 'Catatan legalitas', updatedAt: '2026-09-25T12:00:00Z' },
      { id: 12, caseId: 7, code: 'peralatan', title: 'Peralatan tersimpan', note: 'Catatan peralatan', updatedAt: '2026-09-24T12:00:00Z' },
    ];
    const assessment: Assessment = {
      caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
      recordedCount: 2, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
      findings: [{
        code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'perlu_bukti',
        detail: 'Belum ada catatan tenaga', source: 'Deklarasi pengguna',
      }],
    };
    const evidenceKey = getListEvidenceQueryKey(7);
    const assessmentKey = getGetAssessmentQueryKey(7);
    client.setQueryData(assessmentKey, assessment);
    const invalidate = t.mock.method(client, 'invalidateQueries');
    function AssessmentView() {
      const result = useGetAssessment(7, { query: { queryKey: assessmentKey, staleTime: Infinity } });
      return createElement('p', { 'data-testid': 'assessment-detail' }, result.data?.findings[0]?.detail);
    }
    const draft = { code: 'tenaga', title: 'Judul bukti baru dibatalkan', note: 'Catatan bukti baru dibatalkan' };
    const message = status === 'koneksi terputus' ? 'Failed to fetch' : 'Catatan bukti belum dapat disimpan.';
    const requests: string[] = [];
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      requests.push(`${method} ${path}`);
      assert.equal(path, '/api/cases/7/evidence');
      if (method === 'POST') {
        assert.deepEqual(JSON.parse(String(init?.body)), draft, 'POST memakai kategori dan isian bukti baru');
        if (status === 'koneksi terputus') throw new TypeError(message);
        return Response.json({ error: message }, { status });
      }
      assert.equal(method, 'GET');
      return Response.json(rows);
    };
    const waitForRender = async (ready: () => boolean) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (ready()) return;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      }
      assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
    };
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
    const assertStoredState = () => {
      assert.deepEqual(cardSnapshot(), originalCards, 'jumlah, urutan, judul, catatan, dan tanggal bukti tetap utuh');
      assert.deepEqual(client.getQueryData(evidenceKey), rows, 'draf baru tidak masuk cache bukti');
      assert.deepEqual(client.getQueryData(assessmentKey), assessment, 'cache penilaian tetap utuh');
      assert.deepEqual(renderer!.root.findByProps({ 'data-testid': 'assessment-detail' }).children, [assessment.findings[0].detail]);
      assert.equal(client.getQueryState(evidenceKey)?.isInvalidated, false);
      assert.equal(client.getQueryState(assessmentKey)?.isInvalidated, false);
      assert.equal(invalidate.mock.callCount(), 0, 'kegagalan, pembatalan, dan pembukaan ulang tidak menginvalidasi data');
    };
    const formValues = () => {
      const dialog = renderer!.root.findByProps({ role: 'dialog' });
      assert.equal(dialog.props['aria-label'], 'Tambah catatan bukti', 'yang dibuka adalah tambah bukti, bukan edit');
      return {
        code: dialog.findByProps({ 'data-testid': 'select-evidence-code' }).props.value,
        title: dialog.findByProps({ 'data-testid': 'input-evidence-title' }).props.value,
        note: dialog.findByProps({ 'data-testid': 'input-evidence-note' }).props.value,
      };
    };
    await act(async () => {
      renderer!.root.findByProps({ 'data-testid': 'button-add-evidence' }).props.onClick();
    });
    const initialValues = formValues();
    assert.deepEqual(initialValues, { code: '', title: '', note: '' });
    await act(async () => {
      renderer!.root.findByProps({ 'data-testid': 'select-evidence-code' }).props.onChange({ target: { value: draft.code } });
    });
    await act(async () => {
      renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.onChange({ target: { value: draft.title } });
      renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.onChange({ target: { value: draft.note } });
    });
    await act(async () => {
      renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} });
    });
    await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1
      && renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === false);
    assert.ok(renderer!.root.findByProps({ role: 'alert' }).children.some(child => typeof child === 'string' && child.includes(message)));
    assert.deepEqual(formValues(), draft, 'draf masih tampil sebelum dibatalkan');
    assertStoredState();
    await act(async () => {
      renderer!.root.findByProps({ 'data-testid': 'button-cancel-evidence' }).props.onClick();
    });
    assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0, 'Batal menutup dialog yang gagal');
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
    assertStoredState();
    await act(async () => {
      renderer!.root.findByProps({ 'data-testid': 'button-add-evidence' }).props.onClick();
    });
    assert.deepEqual(formValues(), initialValues, 'kategori, judul, dan catatan kembali ke keadaan awal, bukan draf yang dibatalkan');
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'kesalahan POST lama tidak muncul kembali');
    assert.equal(renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled, true, 'form kosong tidak dapat dikirim');
    assertStoredState();
    assert.deepEqual(requests, [
      'GET /api/cases/7/evidence', 'POST /api/cases/7/evidence',
    ], 'membatalkan dan membuka ulang tidak mengirim ulang POST atau memuat ulang bukti dan penilaian');
  });
}

for (const status of [422, 500, 'koneksi terputus'] as const) {
  test(`catat bukti gagal (${status}) mempertahankan kategori dan isian lalu berhasil saat dicoba ulang`, async (t) => {
    const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
    const originalFetch = globalThis.fetch;
    const originalWindow = testGlobals.window;
    const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
    const originalRows: Evidence[] = [
      { id: 11, caseId: 7, code: 'legalitas', title: 'Bukti awal', note: 'Catatan awal', updatedAt: '2026-09-25T12:00:00Z' },
    ];
    const oldAssessment: Assessment = {
      caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
      recordedCount: 1, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
      findings: [{
        code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'perlu_bukti',
        detail: 'Belum ada catatan tenaga', source: 'Deklarasi pengguna',
      }],
    };
    const draft = { code: 'tenaga', title: 'Bukti tenaga baru', note: 'Catatan tenaga baru' };
    const savedEvidence: Evidence = {
      id: 12, caseId: 7, code: draft.code, title: 'Judul dari server',
      note: 'Catatan dari server', updatedAt: '2026-09-26T12:00:00Z',
    };
    const newAssessment: Assessment = {
      ...oldAssessment, recordedCount: 2,
      findings: [{ ...oldAssessment.findings[0], status: 'tercatat', detail: savedEvidence.note! }],
    };
    let rows = originalRows;
    let assessment = oldAssessment;
    const requests: string[] = [];
    const networkError = new TypeError('Failed to fetch');
    const message = status === 'koneksi terputus'
      ? networkError.message
      : 'Catatan bukti belum dapat disimpan.';
    let postCount = 0;
    let failPost!: () => void;
    const firstResponse = new Promise<Response>((resolve, reject) => {
      failPost = () => {
        if (status === 'koneksi terputus') reject(networkError);
        else resolve(Response.json({ error: message }, { status }));
      };
    });
    let succeedPost!: () => void;
    const retryResponse = new Promise<Response>(resolve => {
      succeedPost = () => {
        rows = [savedEvidence, ...originalRows];
        assessment = newAssessment;
        resolve(Response.json(savedEvidence, { status: 201 }));
      };
    });
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      requests.push(`${method} ${path}`);
      if (path === '/api/cases/7/assessment') {
        assert.equal(method, 'GET');
        return Response.json(assessment);
      }
      assert.equal(path, '/api/cases/7/evidence');
      if (method === 'POST') {
        postCount++;
        assert.ok(postCount <= 2, 'hanya dua POST yang diminta pengguna');
        assert.deepEqual(JSON.parse(String(init?.body)), draft, 'kategori dan isian yang sama dikirim saat dicoba ulang');
        return postCount === 1 ? firstResponse : retryResponse;
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
      await waitForRender(() => cards().length === 1);
      const cardSnapshot = () => cards().map(card => ({
        id: card.props['data-testid'],
        title: card.findByType('h3').children,
        paragraphs: card.findAllByType('p').map(p => p.children),
      }));
      const originalCards = cardSnapshot();
      const assertDraft = () => {
        const dialog = renderer!.root.findByProps({ role: 'dialog' });
        assert.equal(dialog.props['aria-label'], 'Tambah catatan bukti');
        const category = dialog.findByProps({ 'data-testid': 'select-evidence-code' });
        assert.equal(category.props.value, draft.code);
        assert.ok(category.findAllByType('option').some(option => option.props.value === draft.code));
        assert.equal(dialog.findByProps({ 'data-testid': 'input-evidence-title' }).props.value, draft.title);
        assert.equal(dialog.findByProps({ 'data-testid': 'input-evidence-note' }).props.value, draft.note);
      };
      const assertUnchanged = () => {
        assert.deepEqual(cardSnapshot(), originalCards, 'belum ada kartu baru atau perubahan pada bukti lama');
        assert.deepEqual(client.getQueryData(evidenceKey), originalRows);
        assert.deepEqual(client.getQueryData(assessmentKey), oldAssessment);
        assert.equal(client.getQueryState(evidenceKey)?.isInvalidated, false);
        assert.equal(client.getQueryState(assessmentKey)?.isInvalidated, false);
        assert.equal(invalidate.mock.callCount(), 0, 'belum ada invalidasi sebelum POST berhasil');
        assert.deepEqual(renderer!.root.findByProps({ 'data-testid': 'assessment-detail' }).children, [oldAssessment.findings[0].detail]);
      };
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'button-add-evidence' }).props.onClick();
      });
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'select-evidence-code' }).props.onChange({ target: { value: draft.code } });
      });
      await act(async () => {
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-title' }).props.onChange({ target: { value: draft.title } });
        renderer!.root.findByProps({ 'data-testid': 'input-evidence-note' }).props.onChange({ target: { value: draft.note } });
      });
      await act(async () => {
        renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} });
      });
      await waitForRender(() => postCount === 1 && renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === true);
      assertDraft();
      assertUnchanged();
      await act(async () => { failPost(); });
      await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1);
      assert.ok(renderer!.root.findByProps({ role: 'alert' }).children.some(child => typeof child === 'string' && child.includes(message)));
      assertDraft();
      assertUnchanged();
      assert.equal(renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled, false, 'form dapat dikirim ulang setelah gagal');
      assert.deepEqual(requests, ['GET /api/cases/7/evidence', 'POST /api/cases/7/evidence']);
      await act(async () => {
        renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} });
      });
      await waitForRender(() => postCount === 2 && renderer!.root.findByProps({ 'data-testid': 'button-save-evidence' }).props.disabled === true);
      assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'kesalahan hilang sebelum respons percobaan ulang diterima');
      assertDraft();
      assertUnchanged();
      assert.deepEqual(requests, [
        'GET /api/cases/7/evidence', 'POST /api/cases/7/evidence', 'POST /api/cases/7/evidence',
      ], 'POST yang belum berhasil tidak memuat ulang bukti atau penilaian');
      await act(async () => { succeedPost(); });
      await waitForRender(() => renderer!.root.findAllByProps({ role: 'dialog' }).length === 0
        && cards().length === 2
        && renderer!.root.findByProps({ 'data-testid': 'assessment-detail' }).children.includes(savedEvidence.note!));
      assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
      assert.deepEqual(cards().map(card => card.props['data-testid']), ['card-evidence-12', 'card-evidence-11'], 'bukti baru muncul tepat sekali');
      assert.deepEqual(cards()[0].findByType('h3').children, [savedEvidence.title]);
      assert.deepEqual(cards()[0].findAllByType('p')[0].children, [savedEvidence.note], 'kartu mengikuti hasil server, bukan draf');
      assert.deepEqual(cardSnapshot()[1], originalCards[0], 'bukti lama tetap utuh');
      assert.deepEqual(client.getQueryData(evidenceKey), [savedEvidence, ...originalRows]);
      assert.deepEqual(client.getQueryData(assessmentKey), newAssessment);
      assert.equal(invalidate.mock.callCount(), 2);
      assert.equal(postCount, 2);
      assert.deepEqual(requests.slice(3).sort(), [
        'GET /api/cases/7/assessment', 'GET /api/cases/7/evidence',
      ], 'hanya keberhasilan memuat ulang bukti dan penilaian aktif, masing-masing sekali');
    } finally {
      await act(async () => { renderer?.unmount(); });
      client.clear();
      globalThis.fetch = originalFetch;
      testGlobals.window = originalWindow;
      testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    }
  });
}

test('hapus bukti terakhir (204) menampilkan daftar kosong dan memuat ulang jumlah serta temuan penilaian aktif', async (t) => {
  const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalFetch = globalThis.fetch;
  const originalWindow = testGlobals.window;
  const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  t.after(async () => {
    try {
      await act(async () => { renderer?.unmount(); });
    } finally {
      client.clear();
      globalThis.fetch = originalFetch;
      testGlobals.window = originalWindow;
      testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    }
  });
  testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
  const rows: Evidence[] = [
    { id: 12, caseId: 7, code: 'tenaga', title: 'Bukti tenaga terakhir', note: 'Catatan tenaga', updatedAt: '2026-09-24T12:00:00Z' },
  ];
  const oldAssessment: Assessment = {
    caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
    recordedCount: 1, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
    findings: [{
      code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'tercatat',
      detail: 'Catatan tenaga', source: 'Deklarasi pengguna',
    }],
  };
  const newAssessment: Assessment = {
    ...oldAssessment, recordedCount: 0,
    findings: [{
      ...oldAssessment.findings[0], status: 'perlu_bukti',
      detail: 'Belum ada bukti tenaga yang dicatat menurut server.',
    }],
  };
  const evidenceKey = getListEvidenceQueryKey(7);
  const assessmentKey = getGetAssessmentQueryKey(7);
  client.setQueryData(evidenceKey, rows);
  client.setQueryData(assessmentKey, oldAssessment);
  function AssessmentView() {
    const result = useGetAssessment(7, { query: { queryKey: assessmentKey, staleTime: Infinity } });
    return createElement('p', { 'data-testid': 'assessment-result' },
      `${result.data?.recordedCount} · ${result.data?.findings[0]?.status} · ${result.data?.findings[0]?.detail}`);
  }
  const requests: string[] = [];
  let succeedDelete!: () => void;
  const deleteResponse = new Promise<Response>(resolve => {
    succeedDelete = () => resolve(new Response(null, { status: 204 }));
  });
  let reloadEvidence!: () => void;
  const evidenceResponse = new Promise<Response>(resolve => {
    reloadEvidence = () => resolve(Response.json([]));
  });
  let reloadAssessment!: () => void;
  const assessmentResponse = new Promise<Response>(resolve => {
    reloadAssessment = () => resolve(Response.json(newAssessment));
  });
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${path}`);
    if (method === 'DELETE') {
      assert.equal(path, '/api/cases/7/evidence/12');
      return deleteResponse;
    }
    assert.equal(method, 'GET');
    if (path === '/api/cases/7/evidence') return evidenceResponse;
    assert.equal(path, '/api/cases/7/assessment');
    return assessmentResponse;
  };
  const waitForRender = async (ready: () => boolean) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (ready()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
  };
  await act(async () => {
    renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' }),
      createElement(AssessmentView)));
  });
  const cards = () => renderer!.root.findAll(node =>
    typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'));
  const emptyHeadings = () => renderer!.root.findAllByType('h3')
    .filter(node => node.children.includes('Belum ada catatan bukti'));
  const assessmentText = () => renderer!.root.findByProps({ 'data-testid': 'assessment-result' }).children;
  assert.deepEqual(cards().map(card => card.props['data-testid']), ['card-evidence-12']);
  assert.equal(emptyHeadings().length, 0);
  assert.equal(renderer!.root.findAllByProps({ 'data-testid': 'button-add-first-evidence' }).length, 0);
  assert.deepEqual(assessmentText(), ['1 · tercatat · Catatan tenaga']);
  assert.deepEqual(requests, [], 'cache segar tidak dimuat ulang sebelum penghapusan');
  await act(async () => {
    renderer!.root.findByProps({ 'data-testid': 'button-delete-evidence-12' }).props.onClick();
  });
  assert.equal(renderer!.root.findByProps({ role: 'dialog' }).props['aria-label'], 'Hapus catatan bukti?');
  await act(async () => {
    renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.onClick();
  });
  await waitForRender(() => requests.length === 1
    && renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled === true);
  assert.equal(cards().length, 1, 'kartu terakhir tetap ada sebelum DELETE berhasil');
  assert.deepEqual(client.getQueryData(evidenceKey), rows);
  await act(async () => { succeedDelete(); });
  await waitForRender(() => renderer!.root.findAllByProps({ role: 'dialog' }).length === 0 && requests.length === 3);
  assert.deepEqual(requests, [
    'DELETE /api/cases/7/evidence/12',
    'GET /api/cases/7/evidence',
    'GET /api/cases/7/assessment',
  ], 'mutasi asli memuat ulang daftar dan penilaian aktif tepat sekali setelah DELETE 204');
  assert.deepEqual(client.getQueryData(assessmentKey), oldAssessment, 'penilaian menunggu respons server');
  await act(async () => { reloadEvidence(); });
  await waitForRender(() => cards().length === 0 && emptyHeadings().length === 1);
  assert.deepEqual(client.getQueryData(evidenceKey), [], 'cache menyimpan array kosong, bukan bukti terakhir');
  const addFirstButton = renderer!.root.findByProps({ 'data-testid': 'button-add-first-evidence' });
  assert.ok(addFirstButton.children.some(child => typeof child === 'string' && child.trim() === 'Catat bukti'));
  assert.deepEqual(assessmentText(), ['1 · tercatat · Catatan tenaga'], 'daftar kosong tidak merekayasa penilaian lokal');
  await act(async () => { reloadAssessment(); });
  await waitForRender(() => assessmentText().includes(`0 · perlu_bukti · ${newAssessment.findings[0].detail}`));
  assert.deepEqual(client.getQueryData(assessmentKey), newAssessment, 'jumlah dan temuan mengikuti respons server terbaru');
  assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.equal(cards().length, 0);
  assert.equal(emptyHeadings().length, 1);
});

test('Batal sebelum DELETE menutup konfirmasi tanpa mengubah kartu, cache bukti, atau penilaian aktif', async (t) => {
  const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalFetch = globalThis.fetch;
  const originalWindow = testGlobals.window;
  const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  t.after(async () => {
    try {
      await act(async () => { renderer?.unmount(); });
    } finally {
      client.clear();
      globalThis.fetch = originalFetch;
      testGlobals.window = originalWindow;
      testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    }
  });
  testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
  const rows: Evidence[] = [
    { id: 11, caseId: 7, code: 'legalitas', title: 'Legalitas tersimpan', note: 'Catatan legalitas', updatedAt: '2026-09-25T12:00:00Z' },
    { id: 12, caseId: 7, code: 'tenaga', title: 'Tenaga tersimpan', note: 'Catatan tenaga', updatedAt: '2026-09-24T12:00:00Z' },
    { id: 13, caseId: 7, code: 'keuangan', title: 'Keuangan tersimpan', note: 'Catatan keuangan', updatedAt: '2026-09-23T12:00:00Z' },
  ];
  const assessment: Assessment = {
    caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
    recordedCount: 3, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
    findings: [{
      code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'tercatat',
      detail: 'Catatan tenaga', source: 'Deklarasi pengguna',
    }],
  };
  const evidenceKey = getListEvidenceQueryKey(7);
  const assessmentKey = getGetAssessmentQueryKey(7);
  client.setQueryData(evidenceKey, rows);
  client.setQueryData(assessmentKey, assessment);
  const originalEvidence = structuredClone(rows);
  const originalAssessment = structuredClone(assessment);
  const invalidate = t.mock.method(client, 'invalidateQueries');
  const refetch = t.mock.method(client, 'refetchQueries');
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return Response.json({ error: 'Pembatalan tidak boleh mengirim permintaan.' }, { status: 500 });
  };
  function AssessmentView() {
    const result = useGetAssessment(7, { query: { queryKey: assessmentKey, staleTime: Infinity } });
    return createElement('p', { 'data-testid': 'assessment-result' },
      `${result.data?.recordedCount} · ${result.data?.findings[0]?.status} · ${result.data?.findings[0]?.detail}`);
  }
  await act(async () => {
    renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' }),
      createElement(AssessmentView)));
  });
  const cardSnapshot = () => renderer!.root.findAll(node =>
    typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'))
    .map(card => ({
      id: card.props['data-testid'],
      category: card.findByType('span').children,
      title: card.findByType('h3').children,
      paragraphs: card.findAllByType('p').map(p => p.children),
    }));
  const originalCards = cardSnapshot();
  assert.deepEqual(originalCards.map(card => card.id), ['card-evidence-11', 'card-evidence-12', 'card-evidence-13']);
  const assertUnchanged = () => {
    assert.deepEqual(cardSnapshot(), originalCards, 'urutan, kategori, judul, catatan, dan tanggal semua kartu tetap utuh');
    assert.deepEqual(client.getQueryData(evidenceKey), originalEvidence);
    assert.deepEqual(client.getQueryData(assessmentKey), originalAssessment);
    assert.deepEqual(renderer!.root.findByProps({ 'data-testid': 'assessment-result' }).children,
      ['3 · tercatat · Catatan tenaga'], 'jumlah dan temuan penilaian aktif tidak berubah');
    for (const key of [evidenceKey, assessmentKey]) {
      assert.equal(client.getQueryState(key)?.isInvalidated, false);
      assert.equal(client.getQueryState(key)?.fetchStatus, 'idle');
    }
    assert.equal(invalidate.mock.callCount(), 0, 'tidak ada invalidasi, termasuk yang langsung selesai');
    assert.equal(refetch.mock.callCount(), 0, 'tidak ada pemuatan ulang eksplisit');
    assert.deepEqual(requests, [], 'tidak ada DELETE maupun GET bukti atau penilaian');
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
  };
  assertUnchanged();
  await act(async () => {
    renderer!.root.findByProps({ 'data-testid': 'button-delete-evidence-12' }).props.onClick();
  });
  const dialog = renderer!.root.findByProps({ role: 'dialog' });
  assert.equal(dialog.props['aria-label'], 'Hapus catatan bukti?');
  assert.equal(dialog.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled, false,
    'belum ada DELETE yang sedang berjalan');
  assertUnchanged();
  await act(async () => {
    dialog.findByProps({ 'data-testid': 'button-cancel-delete' }).props.onClick();
  });
  assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0, 'Batal menutup konfirmasi');
  assertUnchanged();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
  assertUnchanged();
});

test('hapus bukti berhasil menutup dialog, hanya menghilangkan kartu terpilih, dan memuat ulang penilaian aktif', async (t) => {
  const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalFetch = globalThis.fetch;
  const originalWindow = testGlobals.window;
  const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  t.after(async () => {
    try {
      await act(async () => { renderer?.unmount(); });
    } finally {
      client.clear();
      globalThis.fetch = originalFetch;
      testGlobals.window = originalWindow;
      testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    }
  });
  testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
  const rows: Evidence[] = [
    { id: 11, caseId: 7, code: 'legalitas', title: 'Legalitas tersimpan', note: 'Catatan legalitas', updatedAt: '2026-09-25T12:00:00Z' },
    { id: 12, caseId: 7, code: 'tenaga', title: 'Tenaga dihapus', note: 'Catatan tenaga', updatedAt: '2026-09-24T12:00:00Z' },
    { id: 13, caseId: 7, code: 'keuangan', title: 'Keuangan tersimpan', note: 'Catatan keuangan', updatedAt: '2026-09-23T12:00:00Z' },
  ];
  const remainingRows = [rows[0], rows[2]];
  const oldAssessment: Assessment = {
    caseId: 7, ruleset: 'Aturan persiapan', status: 'perlu_tinjauan',
    recordedCount: 3, requiredCount: 3, disclaimer: 'Deklarasi, bukan verifikasi.',
    findings: [{
      code: 'tenaga', title: 'Tenaga kerja konstruksi', status: 'tercatat',
      detail: 'Catatan tenaga', source: 'Deklarasi pengguna',
    }],
  };
  const newAssessment: Assessment = {
    ...oldAssessment, recordedCount: 2,
    findings: [{
      ...oldAssessment.findings[0], status: 'perlu_bukti',
      detail: 'Bukti tenaga belum dicatat.',
    }],
  };
  const evidenceKey = getListEvidenceQueryKey(7);
  const assessmentKey = getGetAssessmentQueryKey(7);
  client.setQueryData(evidenceKey, rows);
  client.setQueryData(assessmentKey, oldAssessment);
  const invalidate = t.mock.method(client, 'invalidateQueries');
  function AssessmentView() {
    const result = useGetAssessment(7, { query: { queryKey: assessmentKey, staleTime: Infinity } });
    return createElement('p', { 'data-testid': 'assessment-result' },
      `${result.data?.recordedCount} · ${result.data?.findings[0]?.status} · ${result.data?.findings[0]?.detail}`);
  }
  const requests: string[] = [];
  let succeedDelete!: () => void;
  const deleteResponse = new Promise<Response>(resolve => {
    succeedDelete = () => resolve(new Response(null, { status: 204 }));
  });
  let reloadEvidence!: () => void;
  const evidenceResponse = new Promise<Response>(resolve => {
    reloadEvidence = () => resolve(Response.json(remainingRows));
  });
  let reloadAssessment!: () => void;
  const assessmentResponse = new Promise<Response>(resolve => {
    reloadAssessment = () => resolve(Response.json(newAssessment));
  });
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${path}`);
    if (method === 'DELETE') {
      assert.equal(path, '/api/cases/7/evidence/12', 'hanya bukti terpilih yang dihapus');
      return deleteResponse;
    }
    assert.equal(method, 'GET');
    if (path === '/api/cases/7/evidence') return evidenceResponse;
    assert.equal(path, '/api/cases/7/assessment');
    return assessmentResponse;
  };
  const waitForRender = async (ready: () => boolean) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (ready()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
  };
  await act(async () => {
    renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' }),
      createElement(AssessmentView)));
  });
  const cardSnapshot = () => renderer!.root.findAll(node =>
    typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'))
    .map(card => ({
      id: card.props['data-testid'],
      category: card.findByType('span').children,
      title: card.findByType('h3').children,
      paragraphs: card.findAllByType('p').map(p => p.children),
    }));
  const originalCards = cardSnapshot();
  const assessmentText = () => renderer!.root.findByProps({ 'data-testid': 'assessment-result' }).children;
  assert.deepEqual(originalCards.map(card => card.id), ['card-evidence-11', 'card-evidence-12', 'card-evidence-13']);
  assert.deepEqual(assessmentText(), ['3 · tercatat · Catatan tenaga']);
  assert.deepEqual(requests, [], 'cache segar tidak dimuat ulang sebelum penghapusan');
  await act(async () => {
    renderer!.root.findByProps({ 'data-testid': 'button-delete-evidence-12' }).props.onClick();
  });
  assert.equal(renderer!.root.findByProps({ role: 'dialog' }).props['aria-label'], 'Hapus catatan bukti?');
  await act(async () => {
    renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.onClick();
  });
  await waitForRender(() => requests.length === 1
    && renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled === true);
  assert.deepEqual(cardSnapshot(), originalCards, 'kartu tidak hilang sebelum server mengonfirmasi');
  assert.deepEqual(client.getQueryData(evidenceKey), rows);
  assert.deepEqual(client.getQueryData(assessmentKey), oldAssessment);
  assert.equal(invalidate.mock.callCount(), 0);
  await act(async () => { succeedDelete(); });
  await waitForRender(() => renderer!.root.findAllByProps({ role: 'dialog' }).length === 0 && requests.length === 3);
  assert.deepEqual(invalidate.mock.calls.map(call => call.arguments[0]), [
    { queryKey: evidenceKey }, { queryKey: assessmentKey },
  ], 'keberhasilan menginvalidasi daftar bukti dan penilaian masing-masing sekali');
  for (const key of [evidenceKey, assessmentKey]) {
    assert.equal(client.getQueryState(key)?.isInvalidated, true);
    assert.equal(client.getQueryState(key)?.fetchStatus, 'fetching', 'cache aktif langsung dimuat ulang');
  }
  assert.deepEqual(requests, [
    'DELETE /api/cases/7/evidence/12', 'GET /api/cases/7/evidence', 'GET /api/cases/7/assessment',
  ]);
  await act(async () => { reloadEvidence(); reloadAssessment(); });
  await waitForRender(() => cardSnapshot().length === 2
    && assessmentText().includes('2 · perlu_bukti · Bukti tenaga belum dicatat.'));
  assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.deepEqual(cardSnapshot(), [originalCards[0], originalCards[2]],
    'hanya kartu terpilih hilang; urutan, kategori, judul, catatan, dan tanggal kartu lain tetap utuh');
  assert.deepEqual(client.getQueryData(evidenceKey), remainingRows);
  assert.deepEqual(client.getQueryData(assessmentKey), newAssessment, 'cache memakai hasil penilaian terbaru dari server');
  for (const key of [evidenceKey, assessmentKey]) {
    assert.equal(client.getQueryState(key)?.isInvalidated, false);
    assert.equal(client.getQueryState(key)?.fetchStatus, 'idle');
  }
  assert.equal(requests.length, 3, 'tidak ada DELETE ganda atau pemuatan ulang tambahan');
});

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

for (const { closeMode, reopenId } of [
  { closeMode: 'Batal', reopenId: 11 },
  { closeMode: 'Tutup', reopenId: 12 },
  { closeMode: 'Escape', reopenId: 12 },
  { closeMode: 'klik latar', reopenId: 12 },
]) {
test(`menutup konfirmasi DELETE gagal lewat ${closeMode} lalu membuka bukti ${reopenId === 12 ? 'yang sama' : 'lain'} membersihkan pesan lama tanpa DELETE otomatis`, async (t) => {
  const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalFetch = globalThis.fetch;
  const originalWindow = testGlobals.window;
  const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  t.after(async () => {
    try {
      await act(async () => { renderer?.unmount(); });
    } finally {
      client.clear();
      globalThis.fetch = originalFetch;
      testGlobals.window = originalWindow;
      testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    }
  });
  testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  const dialogEvents = new EventTarget();
  testGlobals.window = dialogEvents as unknown as Window & typeof globalThis;
  const rows: Evidence[] = [
    { id: 11, caseId: 7, code: 'legalitas', title: 'Legalitas tersimpan', note: 'Catatan legalitas', updatedAt: '2026-09-25T12:00:00Z' },
    { id: 12, caseId: 7, code: 'tenaga', title: 'Tenaga tersimpan', note: 'Catatan tenaga', updatedAt: '2026-09-24T12:00:00Z' },
  ];
  const evidenceKey = getListEvidenceQueryKey(7);
  client.setQueryData(evidenceKey, rows);
  const requests: string[] = [];
  const messages = ['Penghapusan pertama gagal.', 'Percobaan penghapusan baru gagal.'];
  globalThis.fetch = async (input, init) => {
    requests.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return Response.json({ error: messages[requests.length - 1] }, { status: 500 });
  };
  const waitForRender = async (ready: () => boolean) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (ready()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
  };
  const click = async (testId: string) => {
    await act(async () => { renderer!.root.findByProps({ 'data-testid': testId }).props.onClick(); });
  };
  await act(async () => {
    renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' })));
  });
  await click('button-delete-evidence-12');
  await click('button-confirm-delete');
  await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1
    && renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled === false);
  const assertError = (message: string) => {
    const dialog = renderer!.root.findByProps({ role: 'dialog' });
    assert.ok(dialog.findByProps({ role: 'alert' }).children.some(child =>
      typeof child === 'string' && child.includes(message)));
  };
  assertError(messages[0]);
  await act(async () => {
    renderer!.update(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' })));
  });
  assertError(messages[0]); // Rendering ulang dialog yang sama tidak boleh menghapus kegagalannya.
  await act(async () => {
    if (closeMode === 'Escape') {
      dialogEvents.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
    } else if (closeMode === 'klik latar') {
      const backdrop = renderer!.root.findByProps({ role: 'dialog' }).parent!;
      const target = {};
      backdrop.props.onMouseDown({ target, currentTarget: target });
    } else {
      renderer!.root.findByProps({
        'data-testid': closeMode === 'Tutup' ? 'button-close-dialog' : 'button-cancel-delete',
      }).props.onClick();
    }
  });
  assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.deepEqual(requests, ['DELETE /api/cases/7/evidence/12'], 'menutup konfirmasi tidak mengirim permintaan');
  await click(`button-delete-evidence-${reopenId}`);
  assert.equal(renderer!.root.findByProps({ role: 'dialog' }).props['aria-label'], 'Hapus catatan bukti?');
  assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'konfirmasi baru tidak menampilkan kegagalan bukti sebelumnya');
  assert.equal(renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled, false);
  assert.deepEqual(requests, ['DELETE /api/cases/7/evidence/12'], 'membuka konfirmasi baru tidak mengirim DELETE');
  await click('button-confirm-delete');
  await waitForRender(() => renderer!.root.findAllByProps({ role: 'alert' }).length === 1
    && renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled === false);
  assertError(messages[1]);
  await act(async () => {
    renderer!.update(createElement(QueryClientProvider, { client },
      createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' })));
  });
  assertError(messages[1]); // Pesan baru tetap terlihat setelah render berikutnya.
  assert.ok(!renderer!.root.findByProps({ role: 'alert' }).children.some(child =>
    typeof child === 'string' && child.includes(messages[0])), 'pesan lama tidak muncul kembali');
  assert.deepEqual(requests, [
    'DELETE /api/cases/7/evidence/12', `DELETE /api/cases/7/evidence/${reopenId}`,
  ], 'DELETE berikutnya hanya dikirim setelah konfirmasi dan memakai ID bukti yang dipilih');
  assert.deepEqual(client.getQueryData(evidenceKey), rows);
  assert.deepEqual(renderer!.root.findAll(node =>
    typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'))
    .map(node => node.props['data-testid']), ['card-evidence-11', 'card-evidence-12']);
});
}

for (const status of [204, 500]) {
  for (const submitNextEarly of [false, true]) {
    test(`DELETE tertunda (${status}) tidak mengganggu konfirmasi bukti lain (${submitNextEarly ? 'sudah dikirim' : 'belum dikirim'})`, async (t) => {
      const testGlobals = globalThis as typeof globalThis & { window: Window & typeof globalThis; IS_REACT_ACT_ENVIRONMENT?: boolean };
      const originalFetch = globalThis.fetch;
      const originalWindow = testGlobals.window;
      const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
      });
      let renderer: TestRenderer.ReactTestRenderer | undefined;
      t.after(async () => {
        try {
          await act(async () => { renderer?.unmount(); });
        } finally {
          client.clear();
          globalThis.fetch = originalFetch;
          testGlobals.window = originalWindow;
          testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
        }
      });
      testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
      testGlobals.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
      let rows: Evidence[] = [
        { id: 11, caseId: 7, code: 'legalitas', title: 'Legalitas tersimpan', note: 'Catatan legalitas', updatedAt: '2026-09-25T12:00:00Z' },
        { id: 12, caseId: 7, code: 'tenaga', title: 'Tenaga tersimpan', note: 'Catatan tenaga', updatedAt: '2026-09-24T12:00:00Z' },
      ];
      const evidenceKey = getListEvidenceQueryKey(7);
      const assessmentKey = getGetAssessmentQueryKey(7);
      client.setQueryData(evidenceKey, rows);
      const invalidate = t.mock.method(client, 'invalidateQueries');
      const requests: string[] = [];
      const oldMessage = 'Kegagalan hapus bukti lama';
      let finishFirst!: () => void;
      const firstResponse = new Promise<Response>(resolve => {
        finishFirst = () => {
          if (status === 204) rows = rows.filter(row => row.id !== 12);
          resolve(status === 204 ? new Response(null, { status }) : Response.json({ error: oldMessage }, { status }));
        };
      });
      let finishNext!: () => void;
      const nextResponse = new Promise<Response>(resolve => {
        finishNext = () => {
          rows = rows.filter(row => row.id !== 11);
          resolve(new Response(null, { status: 204 }));
        };
      });
      globalThis.fetch = async (input, init) => {
        const path = String(input);
        const method = init?.method ?? 'GET';
        requests.push(`${method} ${path}`);
        if (method === 'DELETE') {
          assert.ok(path === '/api/cases/7/evidence/12' || path === '/api/cases/7/evidence/11');
          return path.endsWith('/12') ? firstResponse : nextResponse;
        }
        assert.equal(method, 'GET');
        assert.equal(path, '/api/cases/7/evidence');
        return Response.json(rows);
      };
      const waitForRender = async (ready: () => boolean) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (ready()) return;
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
        }
        assert.fail('Komponen tidak mencapai keadaan yang diharapkan');
      };
      const click = async (testId: string) => {
        await act(async () => { renderer!.root.findByProps({ 'data-testid': testId }).props.onClick(); });
      };
      const cards = () => renderer!.root.findAll(node =>
        typeof node.props['data-testid'] === 'string' && node.props['data-testid'].startsWith('card-evidence-'))
        .map(node => node.props['data-testid']);
      await act(async () => {
        renderer = TestRenderer.create(createElement(QueryClientProvider, { client },
          createElement(CaseEvidence, { id: 7, requestType: 'baru', qualification: 'kecil' })));
      });
      await click('button-delete-evidence-12');
      await click('button-confirm-delete');
      await waitForRender(() => requests.length === 1
        && renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled);
      await click('button-cancel-delete');
      assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
      await click('button-delete-evidence-11');
      assert.equal(renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled, false);
      if (submitNextEarly) await click('button-confirm-delete');
      await act(async () => { finishFirst(); });
      await waitForRender(() => client.getMutationCache().getAll()[0].state.status === (status === 204 ? 'success' : 'error'));
      if (status === 204) await waitForRender(() => cards().length === 1);
      assert.deepEqual(cards(), status === 204 ? ['card-evidence-11'] : ['card-evidence-11', 'card-evidence-12'],
        'daftar mengikuti hasil server dari permintaan pertama');
      assert.deepEqual(client.getQueryData(evidenceKey), rows);
      assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 1, 'konfirmasi baru tidak ditutup hasil lama');
      assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, 'kegagalan lama tidak masuk ke konfirmasi baru');
      assert.equal(renderer!.root.findByProps({ 'data-testid': 'button-confirm-delete' }).props.disabled, submitNextEarly,
        'status tombol hanya mengikuti permintaan konfirmasi baru');
      assert.deepEqual(invalidate.mock.calls.map(call => call.arguments[0]),
        status === 204 ? [{ queryKey: evidenceKey }, { queryKey: assessmentKey }] : []);
      if (!submitNextEarly) await click('button-confirm-delete');
      assert.deepEqual(requests.filter(request => request.startsWith('DELETE')), [
        'DELETE /api/cases/7/evidence/12', 'DELETE /api/cases/7/evidence/11',
      ], 'konfirmasi baru mengirim ID sendiri tepat sekali');
      await act(async () => { finishNext(); });
      await waitForRender(() => renderer!.root.findAllByProps({ role: 'dialog' }).length === 0
        && cards().length === (status === 204 ? 0 : 1));
      assert.deepEqual(cards(), status === 204 ? [] : ['card-evidence-12']);
      assert.deepEqual(client.getQueryData(evidenceKey), rows);
    });
  }
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