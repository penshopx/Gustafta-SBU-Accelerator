import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, create } from 'react-test-renderer';
import { SessionLoadingBoundary } from './session-loading-boundary';

test('unresolved session times out without mounting private children and can reload', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  let expire: (() => void) | undefined;
  let cleared = false;
  let reloaded = 0;
  let mounted = 0;
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout(callback: () => void, delay: number) { assert.equal(delay, 20_000); expire = callback; return 1; },
    clearTimeout() { cleared = true; },
  } });
  function PrivateView() { mounted++; return <p>private-content</p>; }
  const props = { loading: <p>loading</p>, reload: () => { reloaded++; }, signOut: async () => {} };
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => { renderer = create(<SessionLoadingBoundary {...props} resolved={false}><PrivateView /></SessionLoadingBoundary>); });
    assert.equal(mounted, 0);
    await act(async () => expire?.());
    assert.match(JSON.stringify(renderer!.toJSON()), /Pemuatan sesi terlalu lama/);
    assert.equal(mounted, 0);
    await act(async () => renderer!.root.findByProps({ 'data-testid': 'button-reload-session' }).props.onClick());
    assert.equal(reloaded, 1);
    await act(async () => renderer!.update(<SessionLoadingBoundary {...props} resolved={true}><PrivateView /></SessionLoadingBoundary>));
    assert.equal(cleared, true);
    assert.match(JSON.stringify(renderer!.toJSON()), /private-content/);
    await act(async () => renderer!.update(<SessionLoadingBoundary {...props} resolved={false}><PrivateView /></SessionLoadingBoundary>));
    assert.equal(JSON.stringify(renderer!.toJSON()).includes('private-content'), false);
    assert.match(JSON.stringify(renderer!.toJSON()), /loading/);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
