import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { useGetDashboard, type Dashboard } from '@workspace/api-client-react';
import { DashboardOverview, DashboardResult } from './dashboard-overview';

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
