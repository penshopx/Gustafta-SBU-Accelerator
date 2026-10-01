import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransitionExplainer } from './transition-explainer';
import type { Finding } from '@workspace/api-client-react';

test('setiap alur menampilkan keputusan terpisah tanpa tanggal terhitung', () => {
  const html = renderToStaticMarkup(createElement(TransitionExplainer));
  const lsbu = html.split('Penyesuaian skema sertifikasi')[1]?.split('Pemberlakuan operasional')[0];
  const operational = html.split('Pemberlakuan operasional')[1]?.split('Konversi SBU eksisting')[0];
  const conversion = html.split('Konversi SBU eksisting')[1]?.split('Gustafta independen')[0];

  assert.ok(lsbu, 'alur LSBU harus ditampilkan');
  assert.ok(operational, 'alur pemberlakuan harus ditampilkan');
  assert.ok(conversion, 'alur konversi SBU harus ditampilkan');
  assert.match(html, /Untuk LSBU[\s\S]*Penyesuaian skema sertifikasi/);
  assert.match(html, /Untuk layanan sertifikasi[\s\S]*Pemberlakuan operasional/);
  assert.match(html, /Untuk SBU yang sudah terbit[\s\S]*Konversi SBU eksisting/);
  assert.match(lsbu, /6 bulan sejak penetapan keputusan/);
  assert.match(lsbu, /Status terbaru Kepdirjen dan tafsir cakupannya belum terkonfirmasi\/ditelaah ahli/);
  assert.match(operational, /Kesiapan SIJK dan keberadaan\/status surat belum terkonfirmasi/);
  assert.match(conversion, /6 bulan sejak terbitnya surat yang dimaksud Pasal 20 ayat \(2\), bukan sejak penetapan Kepdirjen/);
  assert.match(conversion, /Keberadaan dan tanggal terbit surat belum terkonfirmasi/);
  assert.match(conversion, /pengecualian pada Pasal 21 ayat \(7\) perlu ditinjau ahli/);
  for (const [name, track, status] of [
    ['LSBU', lsbu, 'Tenggat belum terverifikasi'],
    ['operasional', operational, 'Tanggal mulai belum terverifikasi'],
    ['konversi', conversion, 'Tenggat belum terverifikasi'],
  ] as const) {
    assert.match(track, new RegExp(status), `${name} harus tetap menahan tanggal`);
    assert.doesNotMatch(track, /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+20\d{2}\b|\b\d+\s*(?:hari|jam|menit|detik)\s+(?:lagi|tersisa)\b/i,
      `${name} tidak boleh menayangkan tanggal tenggat atau hitung mundur`);
  }
  assert.equal(html.match(/Tenggat belum terverifikasi/g)?.length, 2);
  assert.match(operational, /Tanggal mulai belum terverifikasi/);
  assert.match(html, /Belum ada tanggal atau hitung mundur di aplikasi/);
  assert.match(html, /tidak terafiliasi dengan atau mewakili Ditjen Bina Konstruksi, LPJK/);
  assert.match(html, /tidak terhubung ke SIJK dan tidak dapat meminta atau mengesahkan jawaban instansi/);
  assert.match(html, /tinjauan tertulis ahli skema\/LSBU/);
  assert.match(html, /Keberadaan surat dan telaah ahli yang sah[\s\S]*belum terkonfirmasi/);
  assert.match(html, /undangan sosialisasi dan naskah telaah[\s\S]*tidak digunakan sebagai acuan atau pemicu tenggat/);
  assert.doesNotMatch(html, /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]20\d{2}\b|\b\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+20\d{2}\b|\b\d+\s*(?:hari|jam|menit|detik)\b/i);
});

const verified: Finding = {
  code: 'transisi_konversi', title: 'Konversi SBU eksisting', status: 'tercatat',
  detail: 'Sumber penerbit dan telaah ahli telah diverifikasi untuk alur ini.',
  source: 'Penerbit: https://example.test/surat-konversi',
  transitionDate: '2027-02-28',
};

test('persetujuan satu alur hanya membuka tanggal alur tersebut dan menjaga pemicu terpisah', () => {
  for (const code of ['transisi', 'transisi_operasional', 'transisi_konversi']) {
    const html = renderToStaticMarkup(createElement(TransitionExplainer, { findings: [{ ...verified, code }] }));
    assert.equal(html.match(/data-testid="transition-date-/g)?.length, 1);
    assert.match(html, new RegExp(`data-testid="transition-date-${code}"`));
    assert.match(html, /28 Februari 2027/);
    assert.equal(html.match(/Sumber dan telaah terverifikasi/g)?.length, 1);
    assert.match(html, /6 bulan sejak penetapan keputusan/);
    assert.match(html, /6 bulan sejak terbitnya surat yang dimaksud Pasal 20 ayat \(2\), bukan sejak penetapan Kepdirjen/);
    assert.match(html, /Tanggal hanya ditampilkan untuk alur dengan sumber dan telaah terverifikasi/);
    assert.doesNotMatch(html, /Belum ada tanggal atau hitung mundur di aplikasi/);
    assert.match(html, /tidak terafiliasi dengan atau mewakili Ditjen Bina Konstruksi, LPJK/);
    assert.match(html, /Persetujuan satu alur tidak mengesahkan alur lain atau kelayakan permohonan/);
  }
});

test('tanggal tidak tampil untuk keputusan belum disetujui, tanggal rusak, atau respons tidak tersedia', () => {
  for (const props of [
    { findings: [{ ...verified, status: 'perlu_tinjauan' as const }] },
    { findings: [{ ...verified, transitionDate: '2027-02-30' }] },
    { findings: [{ ...verified, transitionDate: '2027-02-30T00:00:00.000Z' }] },
    { findings: [{ ...verified, transitionDate: '2027-02-28T23:00:00.000Z' }] },
    { findings: [{ ...verified, transitionDate: undefined }] },
    { findings: [verified], unavailable: true },
  ]) {
    const html = renderToStaticMarkup(createElement(TransitionExplainer, props));
    assert.doesNotMatch(html, /data-testid="transition-date-|Sumber dan telaah terverifikasi|28 Februari 2027/);
    if (props.unavailable) {
      assert.equal(html.match(/Status verifikasi belum tersedia/g)?.length, 3);
      assert.doesNotMatch(html, /Tenggat belum terverifikasi|Keberadaan surat dan telaah ahli yang sah/);
    }
  }
});

test('tanggal kalender dari waktu ISO API tidak bergeser antar zona waktu', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Jakarta', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      const html = renderToStaticMarkup(createElement(TransitionExplainer, {
        findings: [{ ...verified, transitionDate: '2027-02-28T00:00:00.000Z' }],
      }));
      assert.match(html, /Tenggat: 28 Februari 2027/, zone);
      assert.match(html, /data-testid="transition-date-transisi_konversi"/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});