import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AccountQueries } from './account-queries';
import { CasePreparationExport } from './case-preparation-export';

for (const mode of ['download', 'print'] as const) {
  for (const oldOutcome of ['success', 'failure'] as const) {
    for (const oldFinishesFirst of [true, false]) {
      test(`${mode}: berganti kasus saat respons tertahan (${oldOutcome}, lama selesai ${oldFinishesFirst ? 'dulu' : 'terakhir'})`, async () => {
        const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        const originalAct = globals.IS_REACT_ACT_ENVIRONMENT;
        const originalFetch = globalThis.fetch;
        const originalDocument = globalThis.document;
        const originalWindow = globalThis.window;
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        globals.IS_REACT_ACT_ENVIRONMENT = true;
        let renderer: TestRenderer.ReactTestRenderer | undefined;
        const requests: { url: string; signal: AbortSignal; resolve: (response: Response) => void }[] = [];
        const blobs: Blob[] = [];
        const frames: HTMLIFrameElement[] = [];
        let downloads = 0;
        let prints = 0;
        Object.defineProperty(globalThis, 'window', { configurable: true, value: {
          setTimeout: () => 1, clearTimeout() {},
        } });
        Object.defineProperty(globalThis, 'document', { configurable: true, value: {
          createElement: (tag: string) => {
            if (tag === 'a') return { click: () => { downloads++; } };
            assert.equal(tag, 'iframe');
            const frame = {
              style: {}, remove() {},
              contentWindow: {
                addEventListener() {}, removeEventListener() {}, focus() {},
                print() { prints++; },
              },
            } as unknown as HTMLIFrameElement;
            frames.push(frame);
            return frame;
          },
          body: { appendChild: (frame: HTMLIFrameElement) => frame.onload?.(new Event('load')) },
        } });
        URL.createObjectURL = blob => { blobs.push(blob as Blob); return 'blob:synthetic'; };
        URL.revokeObjectURL = () => {};
        // Deliberately ignore abort: even a late transport completion must be inert.
        globalThis.fetch = (url, init) => new Promise(resolve => {
          requests.push({ url: String(url), signal: init!.signal!, resolve });
        });
        const tree = (caseId: number) => createElement(AccountQueries, {
          userId: 'owner-a', children: createElement(CasePreparationExport, { caseId }),
        });
        const button = () => renderer!.root.findByProps({ 'data-testid': `button-${mode}-summary` });
        const assertPending = (expected: boolean) => {
          for (const kind of ['download', 'print']) {
            assert.equal(renderer!.root.findByProps({ 'data-testid': `button-${kind}-summary` }).props.disabled, expected);
          }
        };
        const response = (html: string, status = 200) => new Response(html, {
          status, headers: { 'content-type': 'text/html' },
        });
        try {
          await act(async () => { renderer = TestRenderer.create(tree(12)); });
          let oldRequest!: Promise<void>;
          await act(async () => { oldRequest = button().props.onClick(); });
          assertPending(true);
          await act(async () => { renderer!.update(tree(13)); });
          assert.equal(requests[0].signal.aborted, true);
          assertPending(false);
          assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);

          let newRequest!: Promise<void>;
          await act(async () => { newRequest = button().props.onClick(); });
          assertPending(true);
          assert.deepEqual(requests.map(item => item.url), [
            '/api/cases/12/preparation-summary', '/api/cases/13/preparation-summary',
          ]);
          const finishOld = async () => {
            await act(async () => {
              requests[0].resolve(response('<p>Kasus lama</p>', oldOutcome === 'failure' ? 500 : 200));
              await oldRequest;
            });
          };
          if (oldFinishesFirst) {
            await finishOld();
            assertPending(true);
            assert.equal(blobs.length + frames.length, 0, 'kasus lama tidak boleh membuat permukaan ekspor');
            assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
            await act(async () => { await button().props.onClick(); });
            assert.equal(requests.length, 2, 'finally lama tidak boleh membuka permintaan ganda');
          }
          await act(async () => {
            requests[1].resolve(response('<p>Kasus baru</p>'));
            await newRequest;
          });
          assertPending(false);
          if (!oldFinishesFirst) await finishOld();
          assertPending(false);
          assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
          assert.equal(requests[1].signal.aborted, false);
          assert.equal(downloads, mode === 'download' ? 1 : 0);
          assert.equal(prints, mode === 'print' ? 1 : 0);
          assert.equal(blobs.length, mode === 'download' ? 1 : 0);
          assert.equal(frames.length, mode === 'print' ? 1 : 0);
          assert.equal(mode === 'download' ? await blobs[0].text() : frames[0].srcdoc, '<p>Kasus baru</p>');
        } finally {
          if (renderer) await act(async () => { renderer!.unmount(); });
          globalThis.fetch = originalFetch;
          URL.createObjectURL = originalCreate;
          URL.revokeObjectURL = originalRevoke;
          Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
          Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
          globals.IS_REACT_ACT_ENVIRONMENT = originalAct;
        }
      });
    }
  }
}

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
        contentWindow: { addEventListener() {}, removeEventListener() {}, focus() {}, print() { prints++; } },
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
