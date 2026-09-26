import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransitionExplainer } from './transition-explainer';

test('dua alur menampilkan pemicu yang berbeda tanpa tenggat terhitung', () => {
  const html = renderToStaticMarkup(createElement(TransitionExplainer));
  const lsbu = html.split('Penyesuaian skema sertifikasi')[1]?.split('Konversi SBU eksisting')[0];
  const conversion = html.split('Konversi SBU eksisting')[1];

  assert.ok(lsbu, 'alur LSBU harus ditampilkan');
  assert.ok(conversion, 'alur konversi SBU harus ditampilkan');
  assert.match(html, /Untuk LSBU[\s\S]*Penyesuaian skema sertifikasi/);
  assert.match(html, /Untuk SBU yang sudah terbit[\s\S]*Konversi SBU eksisting/);
  assert.match(lsbu, /6 bulan sejak penetapan keputusan/);
  assert.match(lsbu, /menunggu penyesuaian SIJK dan surat resmi/);
  assert.match(conversion, /6 bulan sejak terbitnya surat yang dimaksud Pasal 20 ayat \(2\), bukan sejak penetapan Kepdirjen/);
  assert.match(conversion, /Surat pemicunya belum terverifikasi/);
  assert.equal(html.match(/Tenggat belum terverifikasi/g)?.length, 2);
  assert.match(html, /Belum ada tanggal atau hitung mundur di aplikasi/);
  assert.match(html, /tinjauan ahli skema\/LSBU/);
  assert.match(html, /Keduanya belum tersedia untuk verifikasi/);
  assert.doesNotMatch(html, /\b20\d{2}-\d{2}-\d{2}\b|\b\d+\s*(?:hari|jam|menit|detik)\b/i);
});