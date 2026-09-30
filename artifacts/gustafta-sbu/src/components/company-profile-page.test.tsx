import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RuangSimpanCompanyProfileResponse } from '@workspace/api-client-react';
import { CompanyProfileResult } from './company-profile-page';

const profile: RuangSimpanCompanyProfileResponse = {
  userId: 'owner-a',
  profile: { name: 'PT Pilar Samudra', nib: '1276841230091', address: 'Jalan Pelabuhan 17, Makassar', revision: 4, updated_at: '2025-06-03T08:15:00Z' },
};
type State = Parameters<typeof CompanyProfileResult>[0];
function render(overrides: Partial<State> = {}) {
  return renderToStaticMarkup(createElement(CompanyProfileResult, {
    expectedUserId: 'owner-a', data: profile, error: null, isError: false, isFetching: false, isPending: false, retry: () => {},
    ...overrides,
  }));
}
const privateValues = ['PT Pilar Samudra', '1276841230091', 'Jalan Pelabuhan 17', 'text-company-revision', 'text-company-updated'];
function assertPrivateHidden(html: string) {
  for (const value of privateValues) assert.doesNotMatch(html, new RegExp(value));
}

test('successful owner-bound read shows all fields, provenance and limited permission', () => {
  const html = render();
  for (const value of [...privateValues, 'Gustafta Ruang Simpan', 'profile:read', '90 hari', 'text-company-address', '2025']) assert.ok(html.includes(value), value);
  assert.match(html, /target="_blank" rel="noreferrer"/);
  assert.match(html, /https:\/\/gustafta.my.id\/ruang-simpan/);
  assert.doesNotMatch(html, /status-company-profile-error/);
});

test('revision zero and all-blank profile is a legitimate empty source result, not a failure', () => {
  const html = render({ data: { userId: 'owner-a', profile: { name: '', nib: '', address: '', revision: 0, updated_at: null } } });
  assert.match(html, /status-company-profile-empty/);
  assert.match(html, /Profil sumber belum diisi/);
  assert.match(html, /Belum ada pembaruan/);
  assert.match(html, /text-company-revision"[^>]*>0</);
  assert.doesNotMatch(html, /status-company-profile-error/);
});

test('mismatched owner reveals no fields even when a successful response exists', () => {
  const html = render({ expectedUserId: 'owner-b' });
  assert.match(html, /status-company-profile-mismatch/);
  assert.match(html, /button-reload-company-profile/);
  assertPrivateHidden(html);
});

test('fetch in progress suppresses cached profile immediately and disables refresh', () => {
  const html = render({ isFetching: true });
  assert.match(html, /status-company-profile-loading/);
  assert.match(html, /button-refresh-company-profile"[^>]*disabled/);
  assertPrivateHidden(html);
});

test('error, even with cached success data, never reveals stale fields or marks source empty', () => {
  const html = render({ isError: true, error: { status: 503, data: { code: 'source_unavailable', error: 'sensitive upstream detail' } } });
  assert.match(html, /status-company-profile-error/);
  assert.match(html, /bukan berarti profil kosong/);
  assert.doesNotMatch(html, /sensitive upstream detail|status-company-profile-empty/);
  assertPrivateHidden(html);
});

test('only status and allowlisted error code determine safe Indonesian guidance', () => {
  const cases = [
    [401, 'anything', 'Masuk kembali'],
    [404, 'connection_not_configured', 'pemetaan koneksi aman'],
    [424, 'connection_invalid', 'operator Gustafta'],
    [424, 'insufficient_scope', 'profile:read'],
    [429, 'rate_limited', 'Tunggu sebentar'],
    [503, 'connection_unavailable', 'tidak dapat dibaca dengan aman'],
    [503, 'source_unavailable', 'bukan berarti profil kosong'],
  ] as const;
  for (const [status, code, message] of cases) {
    const html = render({ isError: true, error: { status, data: { code, error: 'secret untrusted text' } } });
    assert.ok(html.includes(message), `${status}/${code}: ${message}`);
    assert.doesNotMatch(html, /secret untrusted text/);
    assertPrivateHidden(html);
  }
  const unknown = render({ isError: true, error: { status: 404, data: { code: 'unexpected', error: 'untrusted text' } } });
  assert.match(unknown, /Profil belum dapat dibaca dengan aman/);
  assert.doesNotMatch(unknown, /untrusted text|Belum ada koneksi tertaut/);
});