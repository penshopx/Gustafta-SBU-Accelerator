import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListTransitionVerificationsQueryKey, type TransitionVerification } from '@workspace/api-client-react';
import { TransitionVerificationsPage } from './transition-verifications-page';

function render(records: TransitionVerification[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(getListTransitionVerificationsQueryKey(), records);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(TransitionVerificationsPage)));
}

test('tiga jalur tetap terpisah dan rekaman kosong tidak diakui sebagai persetujuan', () => {
  const html = render([]);
  for (const track of ['transisi', 'transisi_operasional', 'transisi_konversi']) {
    assert.match(html, new RegExp(`data-testid="button-track-${track}"`));
    assert.match(html, new RegExp(`data-testid="status-track-${track}"[\\s\\S]*?Belum diverifikasi`));
  }
  assert.match(html, /Belum ada rekaman untuk jalur ini/);
  assert.doesNotMatch(html, /Sumber &amp; ahli disetujui/);
});

test('menampilkan metadata surat, telaah, keputusan dan jejak pembaruan dari server', () => {
  const html = render([{
    track: 'transisi', publisher: 'Penerbit contoh', sourceUrl: 'https://example.org/surat',
    documentNumber: 'SURAT-001', signatory: 'Penandatangan contoh', issuedOn: '2026-01-15',
    scope: 'Ruang lingkup contoh', documentStatus: 'dicabut', sourceVerified: false,
    expertName: 'Ahli contoh', expertOrganization: 'Organisasi contoh', expertReview: 'Telaah contoh',
    expertReviewedOn: '2026-02-10', expertApproved: false, verifiedBy: 'reviewer-example',
    updatedAt: '2026-02-11T09:00:00.000Z',
  }]);
  for (const value of ['Penerbit contoh', 'SURAT-001', 'Penandatangan contoh', 'Ruang lingkup contoh',
    'Ahli contoh', 'Organisasi contoh', 'Telaah contoh', 'reviewer-example', 'Dicabut']) {
    assert.ok(html.includes(value), `${value} harus terlihat`);
  }
  assert.match(html, /data-testid="text-verification-sourceVerified"[\s\S]*?Belum diverifikasi/);
  assert.match(html, /data-testid="text-verification-expertApproved"[\s\S]*?Belum disetujui/);
  assert.doesNotMatch(html, /Sumber &amp; ahli disetujui/);
});