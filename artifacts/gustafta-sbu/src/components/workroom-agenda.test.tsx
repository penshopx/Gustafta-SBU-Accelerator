import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import type { WorkroomItem } from '@workspace/api-client-react';

test('agenda filters, opens existing editors and exports only with current consent; URLs and cross-case state are cleaned', async () => {
  const g = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = { window: g.window, document: g.document, act: g.IS_REACT_ACT_ENVIRONMENT };
  const window = new HappyWindow({ url: 'http://localhost/' });
  g.window = window as unknown as Window & typeof globalThis;
  g.document = window.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const server = await createServer({ configFile: false, server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } }, esbuild: { jsx: 'automatic' } });
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const blobs: Blob[] = [], revoked: string[] = [], clicks: { name: string; href: string }[] = [];
  URL.createObjectURL = blob => { assert.ok(blob instanceof Blob); blobs.push(blob); return `blob:agenda-${blobs.length}`; };
  URL.revokeObjectURL = url => { revoked.push(url); };
  let failClick = false, edited = '', added = 0;
  window.HTMLAnchorElement.prototype.click = function () {
    if (failClick) throw new Error('Synthetic download failure');
    clicks.push({ name: this.download, href: this.href });
  };
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    const { WorkroomAgenda } = await server.ssrLoadModule(fileURLToPath(new URL('./workroom-agenda.tsx', import.meta.url)));
    const entry: WorkroomItem = { id: 'action-one', caseId: 1, kind: 'action', title: 'Perbaiki legalitas',
      body: 'Catatan tidak diekspor', assignee: 'Tim privat', status: 'todo', dueOn: '2020-01-01',
      revision: 1, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' };
    const render = async (caseId: number, items: WorkroomItem[]) => {
      await act(async () => root.render(createElement(WorkroomAgenda, {
        caseId, items, onEdit: (item: WorkroomItem) => { edited = item.id; }, onAdd: () => { added++; },
      })));
    };
    const el = (id: string) => {
      const result = container.querySelector(`[data-testid="${id}"]`);
      assert.ok(result, id);
      return result as unknown as HTMLInputElement;
    };
    const click = async (id: string) => { await act(async () => el(id).click()); };
    await render(1, [entry]);
    assert.equal(el('button-agenda-download').disabled, true);
    assert.match(el('stat-agenda-overdue').textContent ?? '', /1/);
    await click('button-agenda-edit-action-one'); assert.equal(edited, entry.id);
    await click('button-agenda-add'); assert.equal(added, 1);
    await click('filter-agenda-done'); el('state-agenda-no-results');
    await click('button-agenda-reset'); el('row-agenda-action-one');
    await click('checkbox-agenda-consent');
    assert.equal(el('button-agenda-download').disabled, false);
    await click('button-agenda-download');
    assert.equal(clicks[0].name, 'agenda-sbu-kasus-1.ics');
    const ics = await blobs[0].text();
    assert.match(ics, /SUMMARY:Perbaiki legalitas/);
    assert.ok(!ics.includes('Catatan tidak diekspor'));
    assert.ok(!ics.includes('Tim privat'));
    await click('button-agenda-download');
    assert.ok(revoked.includes('blob:agenda-1'));
    await render(1, [{ ...entry, title: 'Revisi baru', revision: 2 }]);
    assert.equal(el('checkbox-agenda-consent').checked, false);
    assert.equal(el('button-agenda-download').disabled, true);
    assert.ok(revoked.includes('blob:agenda-2'));
    await click('checkbox-agenda-consent');
    failClick = true;
    await click('button-agenda-download');
    el('text-agenda-export-error');
    assert.ok(revoked.includes('blob:agenda-3'));
    assert.equal(document.querySelectorAll('a[download]').length, 0);
    failClick = false;
    await click('button-agenda-download');
    assert.equal(container.querySelector('[data-testid="text-agenda-export-error"]'), null);
    await render(2, [{ ...entry, caseId: 2 }]);
    assert.equal(el('checkbox-agenda-consent').checked, false);
    assert.ok(revoked.includes('blob:agenda-4'));
    await render(2, [entry]);
    el('text-agenda-mismatch');
    assert.equal(container.querySelector('[data-testid="button-agenda-download"]'), null);
    await render(2, [{ ...entry, caseId: 2, status: 'done', dueOn: 'invalid' }]);
    await click('filter-agenda-done');
    assert.match(el('text-agenda-due-action-one').textContent ?? '', /Tanggal tidak valid/);
    assert.equal(el('button-agenda-download').disabled, true);
    await render(2, []);
    el('state-agenda-empty');
  } finally {
    await act(async () => root.unmount());
    await server.close();
    URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke;
    container.remove(); window.happyDOM.abort();
    g.window = previous.window; g.document = previous.document; g.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
