import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Router } from 'wouter';
import { getGetCaseQueryKey, getGetDashboardQueryKey, getListCasesQueryKey, type Dashboard, type SbuCase } from '@workspace/api-client-react';
import { createAccountQueryClient, CrossTabAccountGate } from './account-queries';
import { CaseSummary } from './case-detail-display';
import { CaseRows, DashboardOverview } from './dashboard-overview';

const dashboardKey = getGetDashboardQueryKey();
const casesKey = getListCasesQueryKey();

function PrivateViews() {
  const dashboard = useQuery<Dashboard>({ queryKey: dashboardKey, queryFn: async () => { throw new Error('Not fetched during render'); } });
  const cases = useQuery<SbuCase[]>({ queryKey: casesKey, queryFn: async () => { throw new Error('Not fetched during render'); } });
  const detail = useQuery<SbuCase>({ queryKey: getGetCaseQueryKey(1), queryFn: async () => { throw new Error('Not fetched during render'); } });
  return createElement('main', null,
    dashboard.isLoading ? createElement('p', null, 'Memuat ringkasan') : dashboard.data && createElement(DashboardOverview, { dashboard: dashboard.data }),
    cases.isLoading ? createElement('p', null, 'Memuat kasus') : cases.data && createElement(CaseRows, { cases: cases.data }),
    detail.isLoading ? createElement('p', null, 'Memuat detail') : detail.data && createElement(CaseSummary, { sbuCase: detail.data }),
  );
}

test('peralihan akun memakai cache baru: ringkasan dan kasus lama tidak muncul saat loading maupun sesudahnya', () => {
  const first = createAccountQueryClient();
  const second = createAccountQueryClient();
  const firstDashboard: Dashboard = { total: 1, draft: 1, reviewing: 0, prepared: 0, recent: [{
    id: 1, companyName: 'Perusahaan Akun Pertama', requestType: 'baru', qualification: 'kecil',
    classification: 'Gedung', status: 'draf', updatedAt: '2026-01-01T00:00:00Z',
  } as SbuCase] };
  first.setQueryData(dashboardKey, firstDashboard);
  first.setQueryData(casesKey, firstDashboard.recent);
  first.setQueryData(getGetCaseQueryKey(1), { ...firstDashboard.recent[0], createdAt: '2026-01-01T00:00:00Z' });

  const render = (client: typeof first) => renderToStaticMarkup(
    createElement(QueryClientProvider, { client },
      createElement(Router, {
        hook: (): [string, (path: string) => void] => ['/dashboard', () => {}],
        children: createElement(PrivateViews),
      }),
    ),
  );

  assert.match(render(first), /Perusahaan Akun Pertama/);
  const duringSwitch = render(second);
  assert.match(duringSwitch, /Memuat ringkasan/);
  assert.match(duringSwitch, /Memuat kasus/);
  assert.match(duringSwitch, /Memuat detail/);
  assert.doesNotMatch(duringSwitch, /Perusahaan Akun Pertama|text-dashboard-0|link-case-1/);

  second.setQueryData(dashboardKey, { total: 0, draft: 0, reviewing: 0, prepared: 0, recent: [] } satisfies Dashboard);
  second.setQueryData(casesKey, [] satisfies SbuCase[]);
  const afterSwitch = render(second);
  assert.match(afterSwitch, /Belum ada kasus/);
  assert.doesNotMatch(afterSwitch, /Perusahaan Akun Pertama|link-case-1/);

  first.clear(); // The previous keyed provider clears its cache on logout / identity change.
  assert.equal(first.getQueryData(dashboardKey), undefined);
  assert.equal(first.getQueryData(casesKey), undefined);
  assert.equal(first.getQueryData(getGetCaseQueryKey(1)), undefined);
  assert.equal(second.getQueryData<Dashboard>(dashboardKey)?.total, 0);
});

test('perubahan akun di tab lain langsung menyembunyikan tampilan detail sebelum memuat ulang Clerk', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const oldWindow = globals.window;
  const oldDocument = globals.document;
  const oldStorage = globals.localStorage;
  const oldAct = globals.IS_REACT_ACT_ENVIRONMENT;
  const tab = new EventTarget();
  const documentEvents = new EventTarget();
  const values = new Map<string, string>();
  let reloads = 0;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  globals.window = Object.assign(tab, { location: { reload: () => { reloads++; } } }) as Window & typeof globalThis;
  globals.document = documentEvents as Document;
  globals.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = TestRenderer.create(createElement(CrossTabAccountGate, {
        userId: 'akun-pertama', children: createElement('div', null, 'Rahasia akun pertama'),
      }));
    });
    assert.match(JSON.stringify(renderer!.toJSON()), /Rahasia akun pertama/);
    assert.equal(values.get('gustafta:active-account'), 'akun-pertama');
    await act(async () => {
      tab.dispatchEvent(Object.assign(new Event('storage'), {
        key: 'gustafta:active-account', newValue: 'akun-kedua',
      }));
    });
    assert.doesNotMatch(JSON.stringify(renderer!.toJSON()), /Rahasia akun pertama/);
    assert.equal((renderer!.toJSON() as TestRenderer.ReactTestRendererJSON).props.style.display, 'none');
    assert.equal(reloads, 1);
  } finally {
    await act(async () => { renderer?.unmount(); });
    globals.window = oldWindow;
    globals.document = oldDocument;
    globals.localStorage = oldStorage;
    globals.IS_REACT_ACT_ENVIRONMENT = oldAct;
  }
});
test('Kembali/Maju memeriksa ulang sesi dengan storage lama, akun baru, kosong, atau tidak tersedia', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const original = { window: globals.window, document: globals.document, storage: globals.localStorage, act: globals.IS_REACT_ACT_ENVIRONMENT };
  const tab = new EventTarget();
  let reloads = 0;
  let storedAccount: string | null | undefined;
  const dom = { style: { display: 'contents' } };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  globals.window = Object.assign(tab, { location: { reload: () => {
    assert.equal(dom.style.display, 'none', 'DOM must be concealed before reload');
    reloads++;
  } } }) as Window & typeof globalThis;
  globals.document = new EventTarget() as Document;
  globals.localStorage = {
    getItem: () => {
      if (storedAccount === undefined) throw new Error('Storage disabled');
      return storedAccount;
    },
    setItem: () => {},
  } as unknown as Storage;
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  try {
    for (const route of ['/dashboard', '/cases/1']) {
      for (const stored of ['akun-pertama', 'akun-kedua', null, undefined]) {
      storedAccount = stored;
      await act(async () => {
        renderer = TestRenderer.create(createElement(CrossTabAccountGate, {
          userId: 'akun-pertama',
          children: createElement('main', null, `Rahasia akun pertama ${route}`),
        }), { createNodeMock: () => dom });
      });
      assert.match(JSON.stringify(renderer!.toJSON()), /Rahasia akun pertama/);
      await act(async () => { tab.dispatchEvent(new Event('pagehide')); });
      assert.equal(dom.style.display, 'none');
      assert.doesNotMatch(JSON.stringify(renderer!.toJSON()), /Rahasia akun pertama/);
      const before = reloads;
      await act(async () => {
        tab.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      });
      assert.equal(reloads, before + 1);
      assert.doesNotMatch(JSON.stringify(renderer!.toJSON()), /Rahasia akun pertama/);
      // Duplicate lifecycle notifications cannot start a reload loop.
      await act(async () => {
        tab.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      });
      assert.equal(reloads, before + 1);
      await act(async () => { renderer!.unmount(); });
      const afterUnmount = reloads;
      tab.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      assert.equal(reloads, afterUnmount, 'lifecycle listeners are removed on unmount');
      }
    }
    await act(async () => {
      renderer = TestRenderer.create(createElement(CrossTabAccountGate, {
        userId: null, children: createElement('p', null, 'Halaman publik'),
      }), { createNodeMock: () => dom });
      tab.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
      tab.dispatchEvent(new Event('focus'));
    });
    assert.equal(reloads, 8, 'normal pageshow/focus does not reload signed-out pages');
  } finally {
    await act(async () => { renderer?.unmount(); });
    globals.window = original.window;
    globals.document = original.document;
    globals.localStorage = original.storage;
    globals.IS_REACT_ACT_ENVIRONMENT = original.act;
  }
});