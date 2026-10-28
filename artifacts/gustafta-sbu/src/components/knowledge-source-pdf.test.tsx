import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { KnowledgeSource } from '@workspace/api-client-react';
import { AccountQueries } from './account-queries';
import { KnowledgeSourcePdf } from './knowledge-source-pdf';

const source = {
  id: 'teras12-pelaku-smap-pub@teras12-pelaku-20261028-r1',
  document: 'Materi 3 — Perspektif Pelaku Usaha',
  pdf: { page: 6, pageCount: 9, filename: 'materi-3.pdf', sha256: 'a'.repeat(64) },
} as KnowledgeSource;

test('PDF memakai pemilik tetap; gagal dapat dicoba ulang; halaman tepat dan URL dibersihkan', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const revoked: string[] = [], created: string[] = [];
  let attempt = 0;
  let resolvePending: ((r: Response) => void) | undefined;
  let tree: TestRenderer.ReactTestRenderer | undefined;
  const response = () => new Response(new Blob(['%PDF-synthetic'], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } });
  URL.createObjectURL = () => { const url = `blob:synthetic-${attempt}`; created.push(url); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /knowledge-sources\/teras12-pelaku-smap-pub/);
    assert.equal(new Headers(options?.headers).get('X-SBU-Form-Owner'), 'synthetic-a');
    assert.equal(options?.cache, 'no-store');
    attempt++;
    if (attempt === 1) throw Error('offline');
    if (attempt === 3) return new Promise<Response>(r => { resolvePending = r; });
    return response();
  };
  const element = () => React.createElement(AccountQueries, { userId: 'synthetic-a', children: React.createElement(KnowledgeSourcePdf, { source }) });
  try {
    await act(async () => { tree = TestRenderer.create(element()); });
    const button = () => tree!.root.findByProps({ 'data-testid': 'button-source-pdf' });
    await act(async () => { await button().props.onClick(); });
    assert.equal(tree!.root.findAllByProps({ role: 'alert' }).length, 1);
    assert.match(JSON.stringify(tree!.toJSON()), /Coba buka PDF lagi/);
    await act(async () => { await button().props.onClick(); });
    assert.equal(tree!.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.equal(tree!.root.findByType('canvas').props['data-page'], 6);
    assert.equal(tree!.root.findAllByType('a')[0].props.href, 'blob:synthetic-2#page=6');
    assert.match(JSON.stringify(tree!.toJSON()), /bukan nomor slide cetak/);
    assert.equal(tree!.root.findAllByType('a')[1].props.download, 'materi-3.pdf');
    await act(async () => { void button().props.onClick(); });
    assert.ok(revoked.includes('blob:synthetic-2'));
    await act(async () => { tree!.unmount(); });
    await act(async () => { resolvePending!(response()); });
    // A response after close must never create an abandoned object URL.
    assert.deepEqual(revoked, ['blob:synthetic-2']);
    assert.deepEqual(created, ['blob:synthetic-2']);
  } finally {
    if (tree) await act(async () => tree!.unmount());
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
    globals.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
