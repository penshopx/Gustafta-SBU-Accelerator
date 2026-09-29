import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Router } from 'wouter';
import { getGetDashboardQueryKey, getListCasesQueryKey, type Dashboard, type SbuCase } from '@workspace/api-client-react';
import { createAccountQueryClient } from './account-queries';
import { CaseRows, DashboardOverview } from './dashboard-overview';

const dashboardKey = getGetDashboardQueryKey();
const casesKey = getListCasesQueryKey();

function PrivateViews() {
  const dashboard = useQuery<Dashboard>({ queryKey: dashboardKey, queryFn: async () => { throw new Error('Not fetched during render'); } });
  const cases = useQuery<SbuCase[]>({ queryKey: casesKey, queryFn: async () => { throw new Error('Not fetched during render'); } });
  return createElement('main', null,
    dashboard.isLoading ? createElement('p', null, 'Memuat ringkasan') : dashboard.data && createElement(DashboardOverview, { dashboard: dashboard.data }),
    cases.isLoading ? createElement('p', null, 'Memuat kasus') : cases.data && createElement(CaseRows, { cases: cases.data }),
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
  assert.doesNotMatch(duringSwitch, /Perusahaan Akun Pertama|text-dashboard-0|link-case-1/);

  second.setQueryData(dashboardKey, { total: 0, draft: 0, reviewing: 0, prepared: 0, recent: [] } satisfies Dashboard);
  second.setQueryData(casesKey, [] satisfies SbuCase[]);
  const afterSwitch = render(second);
  assert.match(afterSwitch, /Belum ada kasus/);
  assert.doesNotMatch(afterSwitch, /Perusahaan Akun Pertama|link-case-1/);

  first.clear(); // The previous keyed provider clears its cache on logout / identity change.
  assert.equal(first.getQueryData(dashboardKey), undefined);
  assert.equal(first.getQueryData(casesKey), undefined);
  assert.equal(second.getQueryData<Dashboard>(dashboardKey)?.total, 0);
});