import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { KnowledgeSource } from '@workspace/api-client-react';
import { filterSources, safeSourceUrl, hasPrintedLocator, hasPdfLocator, selectSource, emptyFilters } from '../lib/knowledge-source-view';
import { KnowledgeSourcesSection } from './knowledge-sources-section';

const src = (o: Partial<KnowledgeSource>): KnowledgeSource => ({
  id: 'a', document: 'Dokumen Alfa', version: 'v1', locator: 'Pasal 3 ayat (1)', excerpt: 'Ringkasan alfa', sourceUrl: 'https://example.test/a',
  verificationStatus: 'verified', verificationScope: 'Cakupan alfa', documentStatus: 'berlaku', checkedOn: '2026-01-02', limitation: 'Batas alfa',
  sourceKey: 'alfa', versionId: 'ver-1', sourceRole: 'primer', topics: ['Transisi'], ...o,
} as KnowledgeSource);
const data = [src({}), src({ id: 'b', document: 'Panduan Beta', sourceRole: 'panduan', verificationStatus: 'unverified', topics: ['Klasifikasi'], locator: 'hlm. 4' })];
const view = (o: object) => renderToStaticMarkup(createElement(KnowledgeSourcesSection, { result: { data, isLoading: false, isError: false, isFetching: false, refetch: () => {}, ...o } }));

test('pencarian dan filter', () => {
  assert.equal(filterSources(data, { ...emptyFilters, query: 'PANDUAN' }).length, 1);
  assert.equal(filterSources(data, { ...emptyFilters, query: 'klasifikasi' }).length, 1);
  assert.equal(filterSources(data, { ...emptyFilters, query: 'ver-x' }).length, 0);
  assert.equal(filterSources(data, { ...emptyFilters, status: 'verified' })[0].id, 'a');
  assert.equal(filterSources(data, { ...emptyFilters, role: 'panduan', topic: 'Klasifikasi' }).length, 1);
});
test('url aman dan lokator cetak', () => {
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('data:text/html,x'), null);
  assert.ok(safeSourceUrl('https://example.test/x'));
  assert.equal(hasPrintedLocator('Pasal 3 ayat (1)'), false);
  assert.equal(hasPrintedLocator('hlm. 4'), false);
  assert.equal(hasPrintedLocator('Lampiran I — PDF hlm. 266'), false);
  assert.equal(hasPdfLocator('Lampiran I — PDF hlm. 266'), true);
  assert.equal(hasPrintedLocator('PDF 39/cetak 30'), true);
  assert.equal(hasPdfLocator('PDF 39/cetak 30'), true);
  assert.equal(hasPdfLocator('halaman cetak 260'), false);
});
test('seleksi turunan hilang bila dicabut', () => {
  assert.equal(selectSource(data, 'a')?.id, 'a');
  assert.equal(selectSource([data[1]], 'a'), undefined);
});
test('tampilan daftar, detail, dan keadaan', () => {
  const html = view({});
  assert.match(html, /Menampilkan 2 dari 2 sumber/);
  const detail = renderToStaticMarkup(createElement(KnowledgeSourcesSection, { result: { data, isLoading: false, isError: false, refetch: () => {} }, initialSelectedId: 'a' }));
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /Pasal 3 ayat \(1\)/);
  assert.match(detail, /tidak dicatat/);
  assert.match(detail, /bukan penilaian keberlakuan hukum/);
  const bad = view({ data: [src({ sourceUrl: 'javascript:alert(1)' })] });
  assert.doesNotMatch(bad, /javascript:/);
  assert.match(view({ isError: true }), /button-sources-retry/);
  assert.doesNotMatch(view({ isError: true }), /Dokumen Alfa/);
  assert.doesNotMatch(view({ isFetching: true }), /Dokumen Alfa/);
  assert.match(view({ isLoading: true, data: undefined }), /Memuat sumber/);
  assert.match(view({ data: [] }), /Belum ada sumber aktif/);
  const open = renderToStaticMarkup(createElement(KnowledgeSourcesSection, { result: { data, isLoading: false, isError: false, isFetching: true, refetch: () => {} }, initialSelectedId: 'a' }));
  assert.doesNotMatch(open, /role="dialog"/);
  const none = renderToStaticMarkup(createElement(KnowledgeSourcesSection, { result: { data, isLoading: false, isError: false, refetch: () => {} }, initialFilters: { ...emptyFilters, query: 'zzz' } }));
  assert.match(none, /Tidak ada sumber yang cocok/);
});

test('interaksi filter, detail, keyboard, pencabutan dan coba lagi memakai komponen asli', async () => {
  const { Window } = await import('happy-dom');
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = { window: globals.window, document: globals.document, act: globals.IS_REACT_ACT_ENVIRONMENT };
  const window = new Window({ url: 'http://localhost/' });
  globals.window = window as unknown as typeof globals.window;
  globals.document = window.document as unknown as Document;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const container = window.document.createElement('div');
  window.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  let retries = 0;
  const render = async (patch = {}) => {
    await act(async () => root.render(createElement(KnowledgeSourcesSection, {
      result: { data, isLoading: false, isError: false, refetch: () => { retries++; }, ...patch },
    })));
  };
  const click = async (id: string) => {
    const button = container.querySelector(`[data-testid="${id}"]`);
    assert.ok(button, id);
    await act(async () => { (button as unknown as HTMLElement).click(); });
  };
  try {
    await render();
    const filter = container.querySelector('[data-testid="select-source-status"]') as HTMLSelectElement | null;
    assert.ok(filter);
    await act(async () => {
      filter.value = 'unverified';
      filter.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    assert.doesNotMatch(container.textContent ?? '', /Dokumen Alfa/);
    assert.match(container.textContent ?? '', /Panduan Beta/);
    await click('button-source-reset');
    await click('button-source-detail-a');
    assert.ok(container.querySelector('[role="dialog"]'));
    await act(async () => {
      window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(container.querySelector('[role="dialog"]'), null);
    await click('button-source-detail-a');
    await render({ data: [data[1]] });
    assert.equal(container.querySelector('[role="dialog"]'), null, 'withdrawn source closes detail');
    await render({ isError: true });
    assert.doesNotMatch(container.textContent ?? '', /Dokumen Alfa|Panduan Beta/);
    await click('button-sources-retry');
    assert.equal(retries, 1);
    await render();
    await click('button-source-detail-a');
    await click('button-close-source-detail');
    assert.equal(container.querySelector('[role="dialog"]'), null);
  } finally {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    globals.window = previous.window;
    globals.document = previous.document;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
