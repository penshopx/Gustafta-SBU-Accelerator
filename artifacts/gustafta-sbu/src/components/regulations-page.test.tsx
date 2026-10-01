import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListRegulationsQueryKey, type Regulation } from '@workspace/api-client-react';
import { REGULATIONS, regulationsFor } from '../../../api-server/src/lib/sbu-rules';
import { ListRegulationsResponse } from '../../../../lib/api-zod/src/generated/api';
import { RegulationsPage, RegulationsPageView } from './regulations-page';

test('halaman regulasi menahan tenggat respons API tanpa menyatukan tiga alur transisi', () => {
  // Tanggal contoh hanya berada di sumber; bukan surat Pasal 20 ayat (2) atau
  // bukti bahwa tenggat LSBU maupun konversi boleh dihitung.
  const response: Regulation[] = REGULATIONS.map((rule) => ({
    ...rule,
    source: rule.id === 'kepdirjen-281-2026'
      ? `${rule.source}; contoh tanggal penetapan pada salinan: 1 Januari 2026`
      : rule.source,
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(getListRegulationsQueryKey(), wireResponse(response));

  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(RegulationsPage)),
  );
  assert.match(html, /Rujukan regulasi/);
  assert.doesNotMatch(html, /Memuat data regulasi|Belum ada ringkasan regulasi|Data belum dapat ditampilkan/);
  for (const rule of response) {
    assert.match(html, new RegExp(`data-testid="text-rule-status-${rule.id}"[^>]*>Tenggat belum terverifikasi<`));
    assert.match(html, new RegExp(rule.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(html.match(/data-testid="text-rule-status-/g)?.length, response.length);
  assert.match(html, /Sumber primer:[\s\S]*contoh tanggal penetapan pada salinan: 1 Januari 2026/);

  const lsbu = html.split('Penyesuaian skema sertifikasi')[1]?.split('Pemberlakuan operasional')[0];
  const operational = html.split('Pemberlakuan operasional')[1]?.split('Konversi SBU eksisting')[0];
  const conversion = html.split('Konversi SBU eksisting')[1]?.split('Gustafta independen')[0];
  assert.ok(lsbu && operational && conversion, 'ketiga alur harus tampil terpisah');
  assert.match(html, /Untuk LSBU[\s\S]*Penyesuaian skema sertifikasi/);
  assert.match(lsbu, /6 bulan sejak penetapan keputusan/);
  assert.match(lsbu, /Tenggat belum terverifikasi/);
  assert.match(operational, /Kesiapan SIJK dan keberadaan\/status surat belum terkonfirmasi/);
  assert.match(operational, /Tanggal mulai belum terverifikasi/);
  assert.match(conversion, /6 bulan sejak terbitnya surat yang dimaksud Pasal 20 ayat \(2\), bukan sejak penetapan Kepdirjen/);
  assert.match(conversion, /Tenggat belum terverifikasi/);
  // Sumber primer boleh mengutip tanggal dokumen; status dan penjelasan tidak
  // boleh mengubahnya menjadi tanggal tenggat atau hitung mundur.
  const guidance = html.split('Sumber primer:')[0];
  assert.doesNotMatch(guidance, /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]20\d{2}\b|\b\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+20\d{2}\b|\b\d+\s*(?:hari|jam|menit|detik)\s*(?:lagi|tersisa)\b/i);
  assert.doesNotMatch(html, /1 Juli 2026|\b\d+\s*(?:hari|jam|menit|detik)\s*(?:lagi|tersisa)\b/i);
  assert.match(html, /Belum ada tanggal atau hitung mundur di aplikasi/);
});

function wireResponse(response: Regulation[]): Regulation[] {
  return JSON.parse(JSON.stringify(ListRegulationsResponse.parse(response)));
}

function renderRegulations(response?: Regulation[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (response) client.setQueryData(getListRegulationsQueryKey(), wireResponse(response));
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RegulationsPage)));
}

function verification(track: string): NonNullable<Parameters<typeof regulationsFor>[0]>[number] {
  return {
    track, publisher: 'Penerbit contoh', sourceUrl: 'https://example.test/surat',
    documentNumber: 'SURAT-001', signatory: 'Penandatangan contoh', issuedOn: '2026-08-31',
    scope: 'Cakupan yang telah ditelaah', documentStatus: 'berlaku', sourceVerified: true,
    expertName: 'Ahli contoh', expertOrganization: 'LSBU contoh', expertReview: 'Telaah tertulis',
    expertReviewedOn: '2026-09-01', expertApproved: true, verifiedBy: 'reviewer-example',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };
}

test('halaman memakai keputusan API per alur, bukan status tetap atau persetujuan alur lain', () => {
  for (const track of ['transisi', 'transisi_operasional', 'transisi_konversi']) {
    const response = regulationsFor([verification(track)]);
    const transported = wireResponse(response);
    const dated = transported.flatMap((rule) => rule.transitionFindings).find((finding) => finding.code === track);
    assert.match(dated?.transitionDate ?? '', /T00:00:00\.000Z$/);
    const html = renderRegulations(response);
    assert.equal(html.match(/data-testid="transition-date-/g)?.length, 1);
    assert.match(html, new RegExp(`data-testid="transition-date-${track}"`));
    assert.match(html, track === 'transisi_operasional' ? /Tanggal mulai: 31 Agustus 2026/ : /Tenggat: 28 Februari 2027/);
    assert.match(html, /Sumber verifikasi: Penerbit contoh: https:\/\/example.test\/surat/);
    const label = track === 'transisi' ? 'Alur terkait terverifikasi' : 'Sebagian alur terverifikasi';
    const ruleId = track === 'transisi' ? 'kepdirjen-281-2026' : 'permen-6-2025';
    assert.match(html, new RegExp(`data-testid="text-rule-status-${ruleId}"[^>]*>${label}<`));
    assert.match(html, /tidak terafiliasi dengan atau mewakili Ditjen Bina Konstruksi, LPJK/);
    assert.doesNotMatch(html, /Belum ada tanggal atau hitung mundur di aplikasi/);
  }
});

test('persetujuan semua alur dan pencabutannya tergambar dari respons terbaru', () => {
  const approved = ['transisi', 'transisi_operasional', 'transisi_konversi'].map(verification);
  const html = renderRegulations(regulationsFor(approved));
  assert.equal(html.match(/data-testid="transition-date-/g)?.length, 3);
  assert.equal(html.match(/>Alur terkait terverifikasi</g)?.length, 2);

  for (const change of [{ documentStatus: 'dicabut' }, { expertApproved: false }, { sourceVerified: false }, { expertReview: '' }]) {
    const rejected = renderRegulations(regulationsFor(approved.map((record) => ({ ...record, ...change }))));
    assert.doesNotMatch(rejected, /data-testid="transition-date-|Sumber dan telaah terverifikasi/);
    assert.equal(rejected.match(/>Tenggat belum terverifikasi</g)?.length, 4);
  }
});

test('keadaan memuat atau kosong tidak menyatakan status terbaru sudah diketahui', () => {
  for (const response of [undefined, []]) {
    const html = renderRegulations(response);
    assert.equal(html.match(/Status verifikasi belum tersedia/g)?.length, 3);
    assert.doesNotMatch(html, /data-testid="transition-date-|Keberadaan surat dan telaah ahli yang sah/);
  }
});

test('kegagalan memuat ulang menyembunyikan tanggal dari cache dan menyediakan coba lagi', () => {
  const html = renderToStaticMarkup(createElement(RegulationsPageView, {
    result: {
      data: wireResponse(regulationsFor(['transisi', 'transisi_operasional', 'transisi_konversi'].map(verification))),
      isLoading: false, isError: true, refetch: () => {},
    },
  }));
  assert.match(html, /Data belum dapat ditampilkan/);
  assert.match(html, /data-testid="button-retry"/);
  assert.equal(html.match(/Status verifikasi belum tersedia/g)?.length, 3);
  assert.doesNotMatch(html, /data-testid="transition-date-|Alur terkait terverifikasi|Sumber dan telaah terverifikasi/);
});