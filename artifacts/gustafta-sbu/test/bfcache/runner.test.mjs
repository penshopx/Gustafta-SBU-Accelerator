import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEvidence } from './probe.mjs';
import { startFixtureServer } from './fixture-server.mjs';

const good = () => [
  { type: 'pageshow', trusted: true, persisted: true, at: 100, gateDisplay: 'none', markerVisible: false, sidebarVisible: false },
  { type: 'first-restored-frame', at: 110, gateDisplay: 'none', markerVisible: false, sidebarVisible: false },
  { type: 'first-b-shell', at: 200, clerkIsB: true, shellIsB: true, meStatus: 200, meResponseEnd: 190 },
];
test('requires native trusted persisted restoration, not a synthetic event or reload', () => {
  for (const change of [{ trusted: false }, { persisted: false }]) {
    const records = good();
    Object.assign(records[0], change);
    assert.throws(() => assertEvidence(records), /BFCACHE_INACTIVE/);
  }
});
test('fails on any restored-frame or transient private leak', () => {
  for (const change of [{ gateDisplay: 'contents' }, { markerVisible: true }, { sidebarVisible: true }]) {
    const records = good();
    Object.assign(records[1], change);
    assert.throws(() => assertEvidence(records), /PRIVATE_SURFACE_LEAK/);
  }
  assert.throws(() => assertEvidence([...good(), { type: 'private-leak' }]), /PRIVATE_SURFACE_LEAK/);
  assert.throws(() => assertEvidence(good().filter((r) => r.type !== 'first-restored-frame')), /FIRST_RESTORED_FRAME_MISSING/);
});
test('requires first B shell timestamp after this restore and the successful identity response', () => {
  assert.equal(assertEvidence(good()).firstBShellAt, 200);
  for (const change of [{ meResponseEnd: null }, { meResponseEnd: 99 }, { meResponseEnd: 201 }, { clerkIsB: false }, { meStatus: 503 }]) {
    const records = good();
    Object.assign(records[2], change);
    assert.throws(() => assertEvidence(records), /IDENTITY_RESPONSE_ORDER_NOT_PROVEN/);
  }
  assert.throws(() => assertEvidence(good(), { failure: true }), /SHELL_OPENED_ON_VERIFICATION_FAILURE/);
  assert.doesNotThrow(() => assertEvidence(good().slice(0, 2), { failure: true }));
});
test('isolated fixture serves production files, holds/fails only its own API and closes pending connections', async () => {
  const bundle = await mkdtemp(join(tmpdir(), 'fixture-unit-'));
  let service;
  try {
    await writeFile(join(bundle, 'index.html'), '<!doctype html><title>Production</title>');
    service = await startFixtureServer({
      bundle, publishableKey: 'pk_test_ZXhhbXBsZS50ZXN0JA==',
      clerk: { authenticateRequest: async (request) => ({ toAuth: () => ({ userId: request.headers.get('fixture-user') }) }) },
      owners: { a: 'fixture-a', b: 'fixture-b' }, marker: 'Private fixture',
    });
    const api = (path, user = 'fixture-b') => fetch(service.origin + path, {
      headers: { 'fixture-user': user, 'X-SBU-Form-Owner': user },
    });
    assert.match(await (await fetch(service.origin + '/dashboard')).text(), /Production/);
    assert.equal((await api('/api/me', 'stranger')).status, 401);
    assert.equal((await fetch(service.origin + '/api/me', { headers: { 'fixture-user': 'fixture-b', 'X-SBU-Form-Owner': 'fixture-a' } })).status, 409);
    assert.equal((await api('/api/cases/1')).status, 404);
    assert.equal((await api('/api/cases/1/workroom')).status, 404);
    assert.equal((await api('/api/cases/1/workroom/reviews')).status, 404);
    assert.deepEqual(await (await api('/api/cases/1/workroom', 'fixture-a')).json(), { caseId: 1, items: [] });
    assert.match(await (await api('/api/cases/1', 'fixture-a')).text(), /Private fixture/);
    service.setMode('hold');
    const held = api('/api/me');
    await new Promise((done) => setTimeout(done, 60));
    assert.equal(service.requests.at(-1).respondedAt, null);
    service.setMode('normal');
    service.release();
    assert.equal((await held).status, 200);
    assert.ok(service.requests.at(-1).respondedAt >= service.requests.at(-1).startedAt);
    service.setMode('fail');
    assert.equal((await api('/api/me')).status, 503);
    assert.equal((await api('/api/__bfcache_test/release-me')).status, 501);
    service.setMode('hold');
    const abandoned = api('/api/me').catch(() => null);
    await new Promise((done) => setTimeout(done, 50));
    await service.close();
    await abandoned;
    const origin = service.origin;
    service = null;
    await assert.rejects(fetch(origin + '/dashboard'));
  } finally {
    if (service) await service.close();
    await rm(bundle, { recursive: true, force: true });
  }
});
