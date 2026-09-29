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