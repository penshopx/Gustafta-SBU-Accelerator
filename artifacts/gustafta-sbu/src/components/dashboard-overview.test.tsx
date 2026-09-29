import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import type { Dashboard } from '@workspace/api-client-react';
import { DashboardOverview } from './dashboard-overview';

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