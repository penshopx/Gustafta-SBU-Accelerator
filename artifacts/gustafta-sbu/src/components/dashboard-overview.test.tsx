import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { Window as HappyWindow } from 'happy-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { getGetDashboardQueryKey, useGetDashboard, type Dashboard } from '@workspace/api-client-react';
import { DashboardOverview, DashboardResult } from './dashboard-overview';
import { formatCalendarDate } from '../lib/display-date';

function DashboardWithQuery() {
  const result = useGetDashboard();
  return createElement(DashboardResult, { result });
}

function renderDashboard(client: QueryClient) {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client },
      createElement(Router, {
        hook: (): [string, (path: string) => void] => ['/dashboard', () => {}],
        children: createElement(DashboardWithQuery),
      }),
    ),
  );
}

test('dashboard tetap menampilkan kasus saat timestamp pembaruan kosong atau rusak', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const recent: Dashboard['recent'] = ['', 'bukan-tanggal', '2026-13-01T00:00:00Z'].map((updatedAt, index) => ({
    id: index + 1, companyName: `Perusahaan ${index + 1}`,
    requestType: 'perpanjangan', qualification: 'kecil', classification: 'Gedung',
    status: 'draf', existingSbuExpiresOn: '2027-04-15',
    createdAt: '2026-08-01T12:00:00.000Z', updatedAt,
  }));
  const response: Dashboard = { total: 3, draft: 3, reviewing: 0, prepared: 0, recent };
  client.setQueryData(getGetDashboardQueryKey(), response);
  try {
    const html = renderDashboard(client);
    for (const [index, item] of recent.entries()) {
      const row = html.match(new RegExp(`<a\\b[^>]*data-testid="link-case-${item.id}"[^>]*>([\\s\\S]*?)</a>`));
      assert.ok(row, `kasus ${item.id} tetap dapat dibuka`);
      assert.ok(row[1].includes(item.companyName));
      assert.ok(row[1].includes(`>${index === 0 ? '—' : 'Tanggal tidak valid'}</span>`));
      assert.doesNotMatch(row[1], /Invalid Date|1 Jan 1970|1 Agu 2026|15 Apr 2027/);
    }
  } finally {
    client.clear();
  }
});

function assertNoEmptySummary(html: string) {
  assert.doesNotMatch(html, /data-testid="text-dashboard-\d"|Belum ada kasus|data-testid="link-first-case"/);
}

test('ringkasan menampilkan kerangka pemuatan tanpa menyatakan kasus kosong', () => {
  const html = renderDashboard(new QueryClient());
  assert.match(html, /aria-label="Memuat data"/);
  assert.equal(html.match(/loading-block h-10 w-10/g)?.length, 4);
  assert.doesNotMatch(html, /Data belum dapat ditampilkan|data-testid="button-retry"/);
  assertNoEmptySummary(html);
});

test('kegagalan pemuatan ringkasan menampilkan pesan dan tombol coba lagi, bukan nol', () => {
  // SSR memulai ulang query error yang tersimpan; berikan status hook error langsung ke tampilan yang dipakai halaman.
  const html = renderToStaticMarkup(createElement(DashboardResult, {
    result: { isLoading: false, isError: true, refetch: () => {} },
  }));
  assert.match(html, /Data belum dapat ditampilkan/);
  assert.match(html, /Koneksi sedang terganggu\. Coba muat ulang data\./);
  assert.match(html, /data-testid="button-retry"[^>]*>Coba lagi<\/button>/);
  assert.doesNotMatch(html, /aria-label="Memuat data"/);
  assertNoEmptySummary(html);
});

for (const failures of [1, 2]) {
test(failures === 1
  ? 'coba lagi memuat ulang ringkasan dan mengganti pesan error dengan data berhasil'
  : 'coba lagi tetap dapat dipakai setelah permintaan awal dan percobaan ulang gagal karena jaringan', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = {
    window: globals.window, document: globals.document, fetch: globals.fetch,
    actEnvironment: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  const window = new HappyWindow();
  globals.window = window as unknown as Window & typeof globalThis;
  globals.document = window.document as unknown as Document;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const dashboard: Dashboard = { total: 3, draft: 2, reviewing: 1, prepared: 0, recent: [] };
  let requests = 0;
  globals.fetch = async (input) => {
    assert.equal(input, '/api/dashboard');
    requests++;
    if (requests <= failures) {
      if (failures === 2) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ message: 'Gangguan jaringan' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    return Response.json(dashboard);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  const waitForResult = async (testId: string) => {
    const deadline = Date.now() + 1000;
    while (!container.querySelector(`[data-testid="${testId}"]`) || client.isFetching() > 0) {
      assert.ok(Date.now() < deadline, `hasil ${testId} harus tampil setelah permintaan selesai`);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
  };

  try {
    await act(async () => {
      root.render(createElement(QueryClientProvider, { client },
        createElement(Router, {
          hook: (): [string, (path: string) => void] => ['/dashboard', () => {}],
          children: createElement(DashboardWithQuery),
        }),
      ));
    });
    for (let attempt = 1; attempt <= failures; attempt++) {
      await waitForResult('button-retry');
      assert.equal(requests, attempt, 'setiap klik hanya mengirim satu permintaan baru');
      assert.match(container.textContent, /Data belum dapat ditampilkan/);
      assert.match(container.textContent, /Koneksi sedang terganggu\. Coba muat ulang data\./);
      assertNoEmptySummary(container.innerHTML);
      assert.equal(container.querySelector('[aria-label="Memuat data"]'), null);

      const retry = container.querySelector('[data-testid="button-retry"]');
      assert.ok(retry instanceof window.HTMLButtonElement,
        `tombol coba lagi tersedia setelah kegagalan ke-${attempt}`);
      assert.equal(retry.textContent, 'Coba lagi');
      assert.equal(retry.disabled, false, 'tombol tidak terkunci setelah permintaan gagal');
      await act(async () => { retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    }

    await waitForResult('text-dashboard-0');
    assert.equal(requests, failures + 1, 'percobaan berikutnya tetap mengirim permintaan dashboard');
    assert.equal(container.querySelector('[data-testid="text-dashboard-0"]')?.textContent, '3');
    assert.equal(container.querySelector('[data-testid="text-dashboard-1"]')?.textContent, '2');
    assert.match(container.textContent, /Belum ada kasus/);
    assert.doesNotMatch(container.textContent, /Data belum dapat ditampilkan|Koneksi sedang terganggu/);
    assert.equal(container.querySelector('[data-testid="button-retry"]'), null);
  } finally {
    await act(async () => { root.unmount(); });
    client.clear();
    container.remove();
    await window.happyDOM.abort();
    globals.window = previous.window;
    globals.document = previous.document;
    globals.fetch = previous.fetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
  }
});
}

test('refetch ringkasan yang gagal tidak menyembunyikan error di balik cache dan coba lagi menampilkan angka terbaru', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = {
    window: globals.window, document: globals.document, fetch: globals.fetch,
    actEnvironment: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  const window = new HappyWindow();
  globals.window = window as unknown as Window & typeof globalThis;
  globals.document = window.document as unknown as Document;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const initial: Dashboard = { total: 6, draft: 3, reviewing: 2, prepared: 1, recent: [] };
  const latest: Dashboard = { total: 12, draft: 5, reviewing: 4, prepared: 3, recent: [] };
  let requests = 0;
  globals.fetch = async (input) => {
    assert.equal(input, '/api/dashboard');
    requests++;
    assert.ok(requests <= 3, 'tidak ada permintaan tambahan atau percobaan ulang otomatis');
    if (requests === 2) {
      return new Response(JSON.stringify({ message: 'Pembaruan gagal' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    return Response.json(requests === 1 ? initial : latest);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  const queryKey = getGetDashboardQueryKey();
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  const waitForResult = async (ready: () => boolean, description: string) => {
    const deadline = Date.now() + 1000;
    while (!ready() || client.isFetching() > 0) {
      assert.ok(Date.now() < deadline, description);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
  };
  const assertMetrics = (dashboard: Dashboard) => {
    for (const [index, value] of [
      dashboard.total, dashboard.draft, dashboard.reviewing, dashboard.prepared,
    ].entries()) {
      assert.equal(container.querySelector(`[data-testid="text-dashboard-${index}"]`)?.textContent, String(value));
    }
    assert.equal(container.querySelectorAll('[data-testid^="text-dashboard-"]').length, 4);
  };

  try {
    await act(async () => {
      root.render(createElement(QueryClientProvider, { client },
        createElement(Router, {
          hook: (): [string, (path: string) => void] => ['/dashboard', () => {}],
          children: createElement(DashboardWithQuery),
        }),
      ));
    });
    await waitForResult(() => !!container.querySelector('[data-testid="text-dashboard-0"]'),
      'data awal harus tampil');
    assert.equal(requests, 1);
    assertMetrics(initial);
    assert.deepEqual(client.getQueryData(queryKey), initial);
    assert.equal(client.getQueryState(queryKey)?.status, 'success');
    assert.doesNotMatch(container.textContent, /Data belum dapat ditampilkan|Koneksi sedang terganggu/);
    assert.equal(container.querySelector('[data-testid="button-retry"]'), null);

    // Refetch biasa pada query aktif, bukan kegagalan awal atau invalidasi setelah mutasi.
    await act(async () => { await client.refetchQueries({ queryKey, exact: true }); });
    await waitForResult(() => !!container.querySelector('[data-testid="button-retry"]'),
      'error pembaruan harus tampil meski cache masih berisi data awal');
    assert.equal(requests, 2);
    assert.equal(client.getQueryState(queryKey)?.status, 'error');
    assert.deepEqual(client.getQueryData(queryKey), initial, 'data lama benar-benar tetap berada di cache');
    assert.match(container.textContent, /Data belum dapat ditampilkan/);
    assert.match(container.textContent, /Koneksi sedang terganggu\. Coba muat ulang data\./);
    assertNoEmptySummary(container.innerHTML);
    assert.equal(container.querySelector('[aria-label="Memuat data"]'), null);

    const retry = container.querySelector('[data-testid="button-retry"]');
    assert.ok(retry instanceof window.HTMLButtonElement);
    assert.equal(retry.textContent, 'Coba lagi');
    assert.equal(retry.disabled, false, 'tombol tetap dapat diklik setelah refetch gagal');
    await act(async () => { retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });

    await waitForResult(() => container.querySelector('[data-testid="text-dashboard-0"]')?.textContent === '12',
      'klik coba lagi harus menampilkan angka terbaru');
    assert.equal(requests, 3, 'klik coba lagi mengirim tepat satu permintaan berikutnya');
    assertMetrics(latest);
    assert.deepEqual(client.getQueryData(queryKey), latest);
    assert.equal(client.getQueryState(queryKey)?.status, 'success');
    assert.doesNotMatch(container.textContent, /Data belum dapat ditampilkan|Koneksi sedang terganggu/);
    assert.equal(container.querySelector('[data-testid="button-retry"]'), null);
    assert.equal(container.querySelector('[aria-label="Memuat data"]'), null);
  } finally {
    await act(async () => { root.unmount(); });
    client.clear();
    container.remove();
    await window.happyDOM.abort();
    globals.window = previous.window;
    globals.document = previous.document;
    globals.fetch = previous.fetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
  }
});

test('ringkasan pengguna baru menampilkan empat nol dan keadaan kasus kosong', () => {
  // Respons dashboard untuk pemilik baru tetap kosong meski pemilik lain memiliki kasus.
  const response: Dashboard = { total: 0, draft: 0, reviewing: 0, prepared: 0, recent: [] };
  const html = renderToStaticMarkup(
    createElement(Router, {
      hook: (): [string, (path: string) => void] => ['/dashboard', () => {}],
      children: createElement(DashboardOverview, { dashboard: response }),
    }),
  );

  for (const [index, label] of ['Total kasus', 'Draf', 'Ditinjau', 'Persiapan selesai'].entries()) {
    assert.match(html, new RegExp(`${label}[\\s\\S]*?data-testid="text-dashboard-${index}"[^>]*>0<`));
  }
  assert.equal(html.match(/data-testid="text-dashboard-\d"/g)?.length, 4);
  assert.match(html, /Kasus terbaru[\s\S]*Belum ada kasus/);
  assert.match(html, /data-testid="link-first-case"/);
  assert.doesNotMatch(html, /data-testid="link-case-|data-testid="text-case-company-|Rahasia Draf|Rahasia Tinjau|Rahasia Siap/);
});

test('ringkasan terisi menampilkan angka dan kasus terbaru dari respons tanpa keadaan kosong', () => {
  const response: Dashboard = {
    total: 7, draft: 3, reviewing: 2, prepared: 2,
    recent: [
      {
        id: 41, companyName: 'PT Arsitektur Nusantara', requestType: 'baru',
        qualification: 'kecil', classification: 'Gedung',
        status: 'draf', existingSbuExpiresOn: null,
        createdAt: '2026-08-01T12:00:00Z', updatedAt: '2026-08-03T12:00:00Z',
      },
      {
        id: 52, companyName: 'CV Infrastruktur Selatan', requestType: 'perpanjangan',
        qualification: 'menengah', classification: 'Jalan',
        status: 'ditinjau', existingSbuExpiresOn: '2026-12-01',
        createdAt: '2026-07-01T12:00:00Z', updatedAt: '2026-08-02T12:00:00Z',
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(Router, {
      hook: (): [string, (path: string) => void] => ['/dashboard', () => {}],
      children: createElement(DashboardResult, {
        result: { isLoading: false, isError: false, data: response, refetch: () => {} },
      }),
    }),
  );

  for (const [index, label, value] of [
    [0, 'Total kasus', 7], [1, 'Draf', 3], [2, 'Ditinjau', 2], [3, 'Persiapan selesai', 2],
  ] as const) {
    assert.match(html, new RegExp(`${label}[\\s\\S]*?data-testid="text-dashboard-${index}"[^>]*>${value}<`));
  }
  assert.equal(html.match(/data-testid="text-dashboard-\d"/g)?.length, 4);
  assert.match(html, /Kasus terbaru/);
  for (const [id, name, detail, status] of [
    [41, 'PT Arsitektur Nusantara', 'Permohonan baru · Kualifikasi kecil · Gedung', 'draf'],
    [52, 'CV Infrastruktur Selatan', 'Perpanjangan · Kualifikasi menengah · Jalan', 'ditinjau'],
  ] as const) {
    assert.match(html, new RegExp(`data-testid="link-case-${id}"[^>]*href="/cases/${id}"`));
    assert.match(html, new RegExp(`data-testid="text-case-company-${id}"[^>]*>${name}<`));
    assert.ok(html.includes(detail));
    assert.match(html, new RegExp(`data-testid="status-${status}"`));
  }
  assert.equal(html.match(/data-testid="link-case-\d+"/g)?.length, 2);
  assert.doesNotMatch(html, /Belum ada kasus|data-testid="link-first-case"|aria-label="Memuat data"|Data belum dapat ditampilkan/);
});

test('tanggal pembaruan kasus terbaru mengikuti zona waktu penonton, bukan tanggal kalender SBU', () => {
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
    UTC: ['1 Jan 2027', '31 Des 2026', '1 Jan 2027'],
    'America/St_Johns': [
      '31 Des 2026', '31 Des 2026', '31 Des 2026',
      ...stJohnsCases.map(([date]) => date),
    ],
    'America/Los_Angeles': [
      '31 Des 2026', '31 Des 2026', '31 Des 2026',
      ...dstOffsetCases.flatMap(([date]) => [date, date, date]),
    ],
    'Australia/Sydney': [
      '1 Jan 2027', '1 Jan 2027', '1 Jan 2027',
      '4 Apr 2026', '5 Apr 2026', '5 Apr 2026', '6 Apr 2026',
      '3 Okt 2026', '4 Okt 2026', '4 Okt 2026', '5 Okt 2026',
    ],
    'Asia/Jakarta': ['1 Jan 2027', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Tokyo': ['1 Jan 2027', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Kathmandu': [
      '1 Jan 2027', '1 Jan 2027', '1 Jan 2027',
      '26 Sep 2026', '27 Sep 2026', '31 Des 2026', '1 Jan 2027', '1 Jan 2027',
    ],
    'Pacific/Kiritimati': [
      '1 Jan 2027', '1 Jan 2027', '1 Jan 2027',
      '26 Sep 2026', '27 Sep 2026', '31 Des 2026', '1 Jan 2027', '1 Jan 2027',
    ],
  };
  if (!process.env.DASHBOARD_TZ_CHILD) {
    // The formatter captures the default zone at import time; use fresh processes,
    // not a TZ change after importing the component.
    for (const tz of Object.keys(expectedByZone)) {
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', '--test', '--test-reporter=tap',
        '--test-name-pattern', 'tanggal pembaruan kasus terbaru mengikuti zona waktu',
        fileURLToPath(import.meta.url),
      ], {
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, TZ: tz, DASHBOARD_TZ_CHILD: '1' },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${tz}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /# pass 1\b/, `${tz}: uji dashboard harus benar-benar dijalankan`);
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
  const response: Dashboard = {
    total: expected.length, draft: expected.length, reviewing: 0, prepared: 0,
    recent: [
      '2027-01-01T00:30:00.000Z',
      '2026-12-31T23:30:00.000Z',
      // Same instant as the first case, expressed with an explicit UTC offset.
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
      id: index + 1, companyName: `Perusahaan ${index + 1}`,
      requestType: 'perpanjangan', qualification: 'kecil', classification: 'Gedung',
      status: 'draf', existingSbuExpiresOn: '2027-04-15',
      // Distinct from updatedAt so rendering the creation date fails the test.
      createdAt: '2026-08-01T12:00:00.000Z', updatedAt,
    })),
  };
  assert.equal(response.recent.length, expected.length);
  const html = renderToStaticMarkup(createElement(Router, {
    hook: (): [string, (path: string) => void] => ['/dashboard', () => {}],
    children: createElement(DashboardResult, {
      result: { isLoading: false, isError: false, data: response, refetch: () => {} },
    }),
  }));
  for (const [index, item] of response.recent.entries()) {
    const row = html.match(new RegExp(`<a\\b[^>]*data-testid="link-case-${item.id}"[^>]*>([\\s\\S]*?)</a>`));
    assert.ok(row, `kasus ${item.id} tampil di ${zone}`);
    assert.ok(row[1].includes(`>${expected[index]}</span>`),
      `kasus ${item.id} di ${zone} harus menampilkan ${expected[index]}`);
    assert.doesNotMatch(row[1], /1 Agu 2026|15 Apr 2027/);
  }
  assert.equal(html.match(/data-testid="link-case-\d+"/g)?.length, expected.length);
  // These calendar values must stay fixed even when the update date crosses a day.
  assert.equal(formatCalendarDate('2027-04-15'), '15 Apr 2027');
  assert.equal(formatCalendarDate('2027-04-15T00:00:00.000Z'), '15 Apr 2027');
  for (const [calendarDay, formattedDay] of [
    ['2026-12-31', '31 Des 2026'],
    ['2027-01-01', '1 Jan 2027'],
    ['2026-03-08', '8 Mar 2026'],
    ['2026-11-01', '1 Nov 2026'],
    ['2026-04-05', '5 Apr 2026'],
    ['2026-04-06', '6 Apr 2026'],
    ['2026-10-04', '4 Okt 2026'],
    ['2026-10-05', '5 Okt 2026'],
  ]) {
    assert.equal(formatCalendarDate(calendarDay), formattedDay);
    assert.equal(formatCalendarDate(`${calendarDay}T00:00:00.000Z`), formattedDay);
  }
});
