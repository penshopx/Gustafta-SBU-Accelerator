import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { Router } from 'wouter';

test('landing: renders honest copy, working CTAs, and mounts film only on click', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const before = { window: g.window, document: g.document, fetch: g.fetch, act: g.IS_REACT_ACT_ENVIRONMENT };
  const win = new HappyWindow({ url: 'http://localhost/' });
  g.window = win as unknown as Window & typeof globalThis;
  g.document = win.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const rootDir = fileURLToPath(new URL('../../', import.meta.url));
  const server = await createServer({
    configFile: false, root: rootDir, appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': path.join(rootDir, 'src') }, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic' },
  });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const find = (id: string) => container.querySelector(`[data-testid="${id}"]`);
  try {
    const { default: Page } = await server.ssrLoadModule('/src/components/landing/public-landing.tsx');
    await act(async () => root.render(React.createElement(Router, { hook: () => ['/', () => {}] as [string, (l: string) => void], children: React.createElement(Page) })));
    const hrefs: Record<string, string> = { 'link-sign-up': '/sign-up', 'link-start': '/sign-up', 'link-join-bottom': '/sign-up', 'link-sign-in': '/sign-in', 'link-login-hero': '/sign-in', 'link-simulator': '/simulator', 'link-mini-apps': '/mini-apps', 'link-feature-cases': '/cases', 'link-feature-documents': '/documents', 'link-feature-regulations': '/regulations', 'link-feature-assistant': '/assistant', 'link-feature-personnel': '/personnel', 'link-feature-agenda': '/agenda' };
    for (const [id, href] of Object.entries(hrefs)) assert.equal(find(id)?.getAttribute('href'), href, id);
    assert.equal(find('link-feature-consultations')?.getAttribute('href'), '/consultations');
    const catalog = find('section-local-features')!;
    assert.ok(catalog);
    const expectedAccess = new Map([
      ['/cases', 'Perlu masuk'], ['/documents', 'Perlu masuk'], ['/personnel', 'Perlu masuk'],
      ['/consultations', 'Perlu masuk'], ['/regulations', 'Perlu masuk'], ['/assistant', 'Perlu masuk'],
      ['/agenda', 'Perlu masuk'], ['/simulator', 'Publik'], ['/mini-apps', 'Publik'],
    ]);
    const cards = catalog.querySelectorAll('[data-testid^="link-feature-"]');
    assert.equal(cards.length, expectedAccess.size);
    for (const card of cards) {
      const href = card.getAttribute('href')!;
      assert.ok(expectedAccess.has(href), `local module: ${href}`);
      assert.equal(card.querySelector('span')?.textContent, expectedAccess.get(href));
    }
    assert.match(find('link-feature-cases')!.textContent!, /Workroom.*tinjauan internal.*bukan persetujuan LSBU/);
    assert.match(find('link-feature-documents')!.textContent!, /privat terkait kasus.*pilih kasus, berkas, versi dan halaman.*pratinjau.*setujui pengiriman/);
    assert.match(find('link-feature-consultations')!.textContent!, /privat.*setujui konteks.*bukan konsultasi dengan petugas LSBU/);
    assert.match(find('note-sbu-skk-path')!.textContent!, /Tidak menyediakan pengajuan, pelatihan, atau penerbitan SKK/);
    assert.deepEqual(Array.from(find('note-sbu-skk-path')!.querySelectorAll('a'), a => a.getAttribute('href')), ['/simulator', '/cases', '/personnel']);
    assert.match(find('section-audiences')!.textContent!, /badan usaha.*kontraktor.*konsultan.*pendamping.*Bukan dashboard klien bersama.*akses lintas akun/);
    assert.match(find('note-feature-access')!.textContent!, /peran kontraktor dan konsultan.*tidak menambah hak akses/);
    assert.match(find('card-output-draf')!.textContent!, /persetujuan.*tidak ada pembacaan semua berkas otomatis.*bukan verifikasi dokumen.*tidak otomatis mengubah bukti atau penilaian/);
    for (const a of Array.from(catalog.querySelectorAll('a'))) {
      assert.ok(expectedAccess.has(a.getAttribute('href')!), 'no external links or fabricated case/document IDs');
    }
    assert.doesNotMatch(catalog.textContent!, /LexCom|Brain Project|KonstruksiAI|Ebook|Bimtek|LKPM|berlangganan|memenangkan proyek/i);
    const text = container.textContent ?? '';
    assert.match(text, /Akun, profil dan dokumen tidak disinkronkan dengan Gustafta\.my\.id/);
    const sections = container.querySelectorAll('main > section');
    assert.equal(sections[1]?.getAttribute('data-testid'), 'section-introduction-video', 'video follows opening section');
    assert.equal(container.querySelectorAll('[data-testid="button-load-film"]').length, 1, 'video is not duplicated');
    assert.match(find('note-independence')?.textContent ?? '', /tidak terafiliasi.*LSBU/);
    for (const banned of [/\d+\s*%/, /dijamin|garansi|pasti lolos|100/i, /resmi dari|mitra resmi/i]) assert.doesNotMatch(text, banned);
    assert.match(text, /bukan jaminan/); assert.match(text, /DRAF AI/); assert.match(text, /VERIFIKASI MANUSIA/);
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}]/u, 'no emoji');
    for (const id of ['illus-site', 'illus-flow', 'illus-desk', 'illus-review', 'illus-boundary']) { const el = find(id); assert.ok(el, id); assert.equal(el.getAttribute('aria-hidden'), 'true', id); }
    assert.equal(container.querySelectorAll('img[src^="http"], svg image').length, 0, 'no external images');
    assert.equal(container.querySelector('iframe'), null, 'film not mounted before click');
    assert.match(find('note-film-concept')?.textContent ?? '', /bukan hasil pemeriksaan dokumen atau keputusan sertifikasi/);
    assert.match(find('note-film-concept')?.textContent ?? '', /berdiri sendiri dan privat/);
    assert.doesNotMatch(text, /konsep lama|Gagasan awal: satu sumber/);
    assert.equal(find('link-open-film')?.getAttribute('href'), '/gustafta-film/');
    let filmRequests = 0;
    globalThis.fetch = async (url) => {
      assert.equal(url, '/gustafta-film/');
      filmRequests++;
      return filmRequests === 1
        ? new Response('Unavailable', { status: 503 })
        : new Response('<html><head><title>Film</title></head><body><div id="root"></div></body></html>', { headers: { 'Content-Type': 'text/html' } });
    };
    await act(async () => { (find('button-load-film') as unknown as HTMLButtonElement).click(); });
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /Video belum dapat dimuat/);
    assert.equal(find('iframe-film'), null);
    await act(async () => { (Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Coba lagi') as unknown as HTMLButtonElement).click(); });
    const frame = find('iframe-film');
    assert.ok(frame); assert.equal(frame.getAttribute('src'), null); assert.ok(frame.getAttribute('title'));
    assert.match(frame.getAttribute('srcdoc') ?? '', /<base href="https?:\/\/[^"]+\/gustafta-film\/">/);
    assert.equal(filmRequests, 2); assert.ok(frame.hasAttribute('allowfullscreen'));
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await win.happyDOM.close();
    g.window = before.window; g.document = before.document; g.fetch = before.fetch;
    g.IS_REACT_ACT_ENVIRONMENT = before.act;
  }
});
