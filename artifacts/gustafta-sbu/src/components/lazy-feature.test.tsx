import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createContext, createElement, useContext } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { createServer, type ViteDevServer } from 'vite';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let server: ViteDevServer;
let lazyFeature: typeof import('./lazy-feature').lazyFeature;
before(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    cacheDir: `/tmp/sbu-lazy-feature-${process.pid}`,
    optimizeDeps: { noDiscovery: true, entries: [] },
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  ({ lazyFeature } = await server.ssrLoadModule('/src/components/lazy-feature.tsx'));
});
after(async () => { await server?.close(); });

test('modul tertunda tidak dimuat sebelum dipasang dan menerima pemilik terbaru', async () => {
  const Owner = createContext('signed-out');
  let loads = 0;
  let release!: (value: { default: typeof View }) => void;
  const pending = new Promise<{ default: typeof View }>(resolve => { release = resolve; });
  function View({ owner }: { owner: string }) {
    return createElement('p', null, `${owner}/${useContext(Owner)}`);
  }
  const Feature = lazyFeature(() => { loads++; return pending; });
  const tree = (owner: string, open: boolean) => createElement(Owner.Provider, { value: owner },
    open ? createElement(Feature, { owner }) : createElement('p', null, 'closed'));
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(tree('A', false)); });
    assert.equal(loads, 0);
    await act(async () => { renderer.update(tree('A', true)); });
    assert.equal(loads, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /Memuat fitur/);
    await act(async () => { renderer.update(tree('B', true)); });
    await act(async () => { release({ default: View }); await pending; });
    assert.match(JSON.stringify(renderer.toJSON()), /B\/B/);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /A\/A/);
    assert.equal(loads, 1);
  } finally {
    await act(async () => { renderer?.unmount(); });
  }
});

test('gagal memuat menawarkan muat ulang eksplisit tanpa mengirim isian', async t => {
  t.mock.method(console, 'error', () => {});
  let loads = 0;
  let writes = 0;
  let reloads = 0;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { reload: () => { reloads++; } } },
  });
  const Feature = lazyFeature(() => {
    loads++;
    return loads === 1
      ? Promise.reject(new Error('synthetic module failure'))
      : Promise.resolve({ default: ({ onSave }: { onSave: () => void }) =>
        createElement('button', { onClick: onSave }, 'Simpan contoh') });
  });
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(createElement(Feature, { onSave: () => { writes++; } })); });
    assert.match(JSON.stringify(renderer.toJSON()), /Fitur belum dapat dimuat/);
    assert.match(JSON.stringify(renderer.toJSON()), /Isian yang belum disimpan dapat hilang/);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /synthetic module failure/);
    await act(async () => { renderer.root.findByType('button').props.onClick(); });
    assert.equal(reloads, 1);
    assert.equal(loads, 1);
    assert.equal(writes, 0);
  } finally {
    await act(async () => { renderer?.unmount(); });
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('hasil impor yang terlambat tidak memasang fitur setelah navigasi keluar', async () => {
  let mounts = 0;
  let release!: (value: { default: () => null }) => void;
  const pending = new Promise<{ default: () => null }>(resolve => { release = resolve; });
  const Feature = lazyFeature(() => pending);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Feature)); });
  await act(async () => { renderer.unmount(); });
  await act(async () => {
    release({ default: () => { mounts++; return null; } });
    await pending;
  });
  assert.equal(mounts, 0);
});
