import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AccountQueries } from './account-queries';
import { CasePreparationExport } from './case-preparation-export';

test('ekspor mengambil HTML terbaru, bisa dicoba ulang, mencetak tanpa URL kasus dan membatalkan respons setelah unmount', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalAct = globals.IS_REACT_ACT_ENVIRONMENT;
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  let fail = true;
  let downloads = 0;
  let prints = 0;
  let creates = 0;
  let frame: HTMLIFrameElement | undefined;
  let downloadedBlob: Blob | undefined;
  let release!: (response: Response) => void;
  let delayed = false;
  let capturedSignal: AbortSignal | undefined;
  const requests: { url: string; owner: string | null; cache?: RequestCache }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (fn: () => void, time: number) => {
      const timer = setTimeout(fn, time); timers.add(timer); return timer;
    },
    clearTimeout,
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: (tag: string) => {
      if (tag === 'a') return { click: () => { downloads++; } };
      frame = {
        style: {}, setAttribute() {}, remove() {},
        contentWindow: { addEventListener() {}, focus() {}, print() { prints++; } },
      } as unknown as HTMLIFrameElement;
      return frame;
    },
    body: { appendChild: (element: HTMLIFrameElement) => element.onload?.(new Event('load')) },
  } });
  URL.createObjectURL = blob => { creates++; downloadedBlob = blob as Blob; return 'blob:opaque'; };
  URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), owner: new Headers(init?.headers).get('X-SBU-Form-Owner'), cache: init?.cache });
    capturedSignal = init?.signal ?? undefined;
    if (delayed) return new Promise(resolve => { release = resolve; });
    if (fail) return new Response('{"error":"Indisponible"}', { status: 500, headers: { 'content-type': 'application/json' } });
    return new Response('<!doctype html><p>Snapshot terbaru</p>', { headers: { 'content-type': 'text/html' } });
  };
  const mount = async () => {
    await act(async () => { renderer = TestRenderer.create(createElement(AccountQueries, {
      userId: 'owner-a', children: createElement(CasePreparationExport, { caseId: 12 }),
    })); });
  };
  const button = (id: string) => renderer!.root.findByProps({ 'data-testid': id });
  try {
    await mount();
    await act(async () => { await button('button-download-summary').props.onClick(); });
    assert.match(renderer!.root.findByProps({ role: 'alert' }).children.join(''), /Tidak ada data lama/);
    assert.equal(creates, 0);
    assert.equal(button('button-download-summary').props.disabled, false);
    fail = false;
    await act(async () => { await button('button-download-summary').props.onClick(); });
    assert.equal(downloads, 1);
    assert.equal(await downloadedBlob!.text(), '<!doctype html><p>Snapshot terbaru</p>');
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
    await act(async () => { await button('button-print-summary').props.onClick(); });
    assert.equal(prints, 1);
    assert.equal(frame!.srcdoc, '<!doctype html><p>Snapshot terbaru</p>');
    assert.equal(frame!.src, undefined, 'isi kasus tidak boleh dikirim lewat URL cetak');
    assert.deepEqual(requests.map(item => item.owner), ['owner-a', 'owner-a', 'owner-a']);
    assert.ok(requests.every(item => item.cache === 'no-store' && item.url === '/api/cases/12/preparation-summary'));
    delayed = true;
    let pending!: Promise<void>;
    await act(async () => { pending = button('button-download-summary').props.onClick(); });
    assert.equal(button('button-download-summary').props.disabled, true);
    await act(async () => { renderer!.unmount(); });
    assert.equal(capturedSignal!.aborted, true);
    release(new Response('<p>Data akun lama</p>', { headers: { 'content-type': 'text/html' } }));
    await pending;
    assert.equal(downloads, 1);
    assert.equal(creates, 1, 'respons tertunda tidak boleh menghasilkan berkas setelah akun ditutup');
  } finally {
    for (const timer of timers) clearTimeout(timer);
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    globals.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});
