import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { FetchQueryOptions } from '@tanstack/react-query';
import {
  getGetMeQueryOptions, getGetWorkspaceQueryOptions, getGetDashboardQueryOptions,
  getListCasesQueryOptions, getGetCaseQueryOptions, getListEvidenceQueryOptions,
  getGetAssessmentQueryOptions, getListCaseDocumentsQueryOptions,
  getGetLocalCompanyProfileQueryOptions, getListTransitionVerificationsQueryOptions,
  downloadCaseDocument,
} from '@workspace/api-client-react';
import { AccountQueries, createAccountQueryClient, useAccountReadOptions } from './account-queries';

test('GET tertunda sesudah /me tidak menyimpan data cookie B dalam cache tab A; retry tetap terikat A', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const oldAct = globals.IS_REACT_ACT_ENVIRONMENT;
  const oldFetch = globalThis.fetch;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  let options!: ReturnType<typeof useAccountReadOptions>;
  function Reader() { options = useAccountReadOptions(); return createElement('p', null, 'Privat'); }
  const tree = (owner: string, key?: string) => createElement(AccountQueries, {
    userId: owner, key, children: createElement(Reader),
  });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  const client = createAccountQueryClient();
  let cookieOwner = 'akun-a';
  let release!: () => void;
  let started!: () => void;
  const begun = new Promise<void>(resolve => { started = resolve; });
  const deferred = new Promise<void>(resolve => { release = resolve; });
  let delay = false;
  let offline = false;
  const seen: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const owner = new Headers(init?.headers).get('X-SBU-Form-Owner') ?? '';
    seen.push(owner);
    assert.equal(init?.cache, 'no-store');
    if (delay) { started(); await deferred; }
    if (offline) throw new TypeError('Network unavailable');
    return owner === cookieOwner
      ? new Response(JSON.stringify({ userId: cookieOwner }), { headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ error: 'Sesi akun berubah' }), {
        status: 409, headers: { 'content-type': 'application/json' },
      });
  };
  try {
    await act(async () => { renderer = TestRenderer.create(tree('akun-a')); });
    const captured = options;
    const me = await client.fetchQuery(getGetMeQueryOptions(options));
    assert.equal(me.userId, 'akun-a');
    // No storage/channel/focus event and no second /me check.
    delay = true;
    const listOptions = getListCasesQueryOptions(options);
    const pending = client.fetchQuery({ ...listOptions, retry: false });
    await begun;
    cookieOwner = 'akun-b';
    release();
    await assert.rejects(pending, { status: 409 });
    assert.equal(client.getQueryData(listOptions.queryKey), undefined);
    delay = false;
    // Deliberately preserve the old reader across a context update.
    await act(async () => { renderer!.update(tree('akun-b')); });
    assert.equal(options, captured);
    const queries = [
      getGetMeQueryOptions(options), getGetWorkspaceQueryOptions(options),
      getGetDashboardQueryOptions(options), getListCasesQueryOptions(options),
      getGetCaseQueryOptions(35, options), getListEvidenceQueryOptions(35, options),
      getGetAssessmentQueryOptions(35, options), getListCaseDocumentsQueryOptions(35, options),
      getGetLocalCompanyProfileQueryOptions(options), getListTransitionVerificationsQueryOptions(options),
    ];
    client.clear();
    for (const query of queries) {
      await assert.rejects(client.fetchQuery({ ...query, retry: false, staleTime: 0 } as FetchQueryOptions<unknown>), { status: 409 });
      assert.equal(client.getQueryData(query.queryKey), undefined);
    }
    await assert.rejects(downloadCaseDocument(35, 'document-b', options.request), { status: 409 });
    offline = true;
    await assert.rejects(client.fetchQuery({ ...listOptions, retry: false }), /Network unavailable/);
    assert.equal(client.getQueryData(listOptions.queryKey), undefined);
    offline = false;
    await assert.rejects(client.fetchQuery({ ...listOptions, retry: 1, retryDelay: 0 }), { status: 409 });
    assert.ok(seen.every(owner => owner === 'akun-a'), 'semua retry tetap memakai pemilik asal');
    // A fresh keyed provider can read B, but retained A options still cannot.
    await act(async () => { renderer!.update(tree('akun-b', 'akun-b')); });
    assert.equal(options.request.headers['X-SBU-Form-Owner'], 'akun-b');
    const next = createAccountQueryClient();
    assert.equal((await next.fetchQuery(getGetMeQueryOptions(options))).userId, 'akun-b');
    next.clear();
    await assert.rejects(client.fetchQuery({ ...getGetMeQueryOptions(captured), retry: false }), { status: 409 });
  } finally {
    release?.();
    await act(async () => { renderer?.unmount(); });
    client.clear();
    globalThis.fetch = oldFetch;
    globals.IS_REACT_ACT_ENVIRONMENT = oldAct;
  }
});
