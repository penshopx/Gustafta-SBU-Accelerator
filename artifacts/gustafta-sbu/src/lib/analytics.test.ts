import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYTICS_EVENTS, trackEvent } from './analytics.ts';

async function withWindow(value: unknown, run: () => void | Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value });
  try {
    await run();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('analytics sends only fixed event names, without data or URL arguments', async () => {
  const calls: unknown[][] = [];
  await withWindow({ umami: { track: (...args: unknown[]) => { calls.push(args); } } }, () => {
    for (const name of ANALYTICS_EVENTS) trackEvent(name);
    trackEvent('not_an_allowed_event' as never);
  });
  assert.deepEqual(calls, [['service_request_reviewed'], ['service_whatsapp_clicked']]);
});

test('analytics is safe with no browser, no tracker, or synchronous errors', async () => {
  await withWindow(undefined, () => assert.doesNotThrow(() => trackEvent('service_request_reviewed')));
  await withWindow({}, () => assert.doesNotThrow(() => trackEvent('service_request_reviewed')));
  await withWindow({ umami: { track: () => { throw new Error('synthetic tracker failure'); } } },
    () => assert.doesNotThrow(() => trackEvent('service_whatsapp_clicked')));
});

test('analytics consumes rejected promises without waiting or throwing', async () => {
  await withWindow({ umami: { track: () => Promise.reject(new Error('synthetic async failure')) } }, async () => {
    assert.equal(trackEvent('service_whatsapp_clicked'), undefined);
    await new Promise<void>(resolve => setImmediate(resolve));
  });
});
