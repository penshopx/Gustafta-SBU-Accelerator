import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListRegulationsQueryKey, type Regulation } from '@workspace/api-client-react';
import { REGULATIONS } from '../../../api-server/src/lib/sbu-rules';
import { RegulationsPage } from './regulations-page';

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
  client.setQueryData(getListRegulationsQueryKey(), response);

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