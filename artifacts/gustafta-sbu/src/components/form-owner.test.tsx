import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  getUpdateMeMutationOptions, getCreateCaseMutationOptions, getUpdateCaseMutationOptions,
  getDeleteCaseMutationOptions, getAddEvidenceMutationOptions, getUpdateEvidenceMutationOptions,
  getDeleteEvidenceMutationOptions, getPutTransitionVerificationMutationOptions,
} from '@workspace/api-client-react';
import { AccountQueries, useFormMutationOptions } from './account-queries';

test('mutasi tertunda dan formulir lama selalu mengirim akun asal, bukan akun terbaru', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalAct = globals.IS_REACT_ACT_ENVIRONMENT;
  const originalFetch = globalThis.fetch;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  let options!: ReturnType<typeof useFormMutationOptions>;
  function Draft() {
    options = useFormMutationOptions();
    return createElement('p', null, 'Formulir');
  }
  const tree = (owner: string, key?: string) => createElement(AccountQueries, {
    userId: owner, key, children: createElement(Draft),
  });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  const seen: { method: string; owner: string | null }[] = [];
  globalThis.fetch = async (_url, init) => {
    seen.push({ method: init?.method ?? 'GET', owner: new Headers(init?.headers).get('X-SBU-Form-Owner') });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await act(async () => { renderer = TestRenderer.create(tree('akun-a')); });
    const oldOptions = options;
    const queued = getCreateCaseMutationOptions(oldOptions);
    // Deliberately keep the old draft mounted, simulating a missed tab event.
    await act(async () => { renderer!.update(tree('akun-b')); });
    assert.equal(options, oldOptions, 'pemilik formulir tidak boleh diperbarui bersama konteks');
    const profile = { role: 'kontraktor' as const, displayName: 'Nama lama', organizationName: '' };
    const sbuCase = { companyName: 'Perusahaan lama', requestType: 'baru' as const, qualification: 'kecil' as const, classification: 'gedung' };
    const evidence = { code: 'legalitas', title: 'Bukti lama', note: '' };
    const invoke = async (mutation: { mutationFn?: unknown }, variables: unknown) =>
      (mutation.mutationFn as (variables: unknown, context: unknown) => Promise<unknown>)(variables, {});
    await invoke(queued, { data: sbuCase });
    await invoke(getUpdateMeMutationOptions(options), { data: profile });
    await invoke(getUpdateCaseMutationOptions(options), { id: 1, data: sbuCase });
    await invoke(getDeleteCaseMutationOptions(options), { id: 1 });
    await invoke(getAddEvidenceMutationOptions(options), { id: 1, data: evidence });
    await invoke(getUpdateEvidenceMutationOptions(options), { id: 1, evidenceId: 2, data: evidence });
    await invoke(getDeleteEvidenceMutationOptions(options), { id: 1, evidenceId: 2 });
    await invoke(getPutTransitionVerificationMutationOptions(options), { track: 'transisi', data: {} });
    assert.equal(seen.length, 8);
    assert.ok(seen.every(request => request.owner === 'akun-a'));
    assert.deepEqual(seen.map(request => request.method), ['POST', 'PATCH', 'PATCH', 'DELETE', 'POST', 'PATCH', 'DELETE', 'PUT']);
    // Production's identity-keyed provider discards drafts and creates new forms.
    await act(async () => { renderer!.update(tree('akun-b', 'akun-b')); });
    assert.equal(options.request.headers['X-SBU-Form-Owner'], 'akun-b');
    await invoke(getUpdateMeMutationOptions(options), { data: profile });
    assert.equal(seen.at(-1)?.owner, 'akun-b');
    // Even callbacks/options retained after unmount cannot be retargeted to B.
    await invoke(queued, { data: sbuCase });
    assert.equal(seen.at(-1)?.owner, 'akun-a');
  } finally {
    await act(async () => { renderer?.unmount(); });
    globals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    globalThis.fetch = originalFetch;
  }
});
