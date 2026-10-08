import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrySessionCheck, SessionVerificationTimeout, withSessionDeadline } from './session-request';

test('authentication failures and timeouts never retry automatically', () => {
  assert.equal(retrySessionCheck(0, { status: 401 }), false);
  assert.equal(retrySessionCheck(0, { status: 403 }), false);
  assert.equal(retrySessionCheck(0, new SessionVerificationTimeout()), false);
  assert.equal(retrySessionCheck(0, { status: 503 }), true);
  assert.equal(retrySessionCheck(1, { status: 503 }), false);
});

test('successful identity checks return data without a pending deadline', async () => {
  assert.deepEqual(await withSessionDeadline(async () => ({ ok: true }), undefined, 100), { ok: true });
});

test('a request that ignores abort still ends at the deadline', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(withSessionDeadline((received) => {
    signal = received;
    return new Promise(() => {});
  }, undefined, 10), SessionVerificationTimeout);
  assert.equal(signal?.aborted, true);
});

test('owner cancellation aborts the request without reporting a timeout', async () => {
  const parent = new AbortController();
  let signal: AbortSignal | undefined;
  const pending = withSessionDeadline((received) => {
    signal = received;
    return new Promise(() => {});
  }, parent.signal, 1000);
  parent.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(signal?.aborted, true);
});

test('a cancelled owner never starts another identity request', async () => {
  const parent = new AbortController();
  parent.abort();
  let called = false;
  await assert.rejects(withSessionDeadline(async () => {
    called = true;
  }, parent.signal), { name: 'AbortError' });
  assert.equal(called, false);
});
