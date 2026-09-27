import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransitionExplainer } from './transition-explainer';

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