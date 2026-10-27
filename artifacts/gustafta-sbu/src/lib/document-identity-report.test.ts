import assert from 'node:assert/strict';
import test from 'node:test';
import { formatIdentityReport } from './document-identity-report';
import type { IdentityRow } from './document-identity';

const row = (id: string, patch: Partial<IdentityRow> = {}): IdentityRow => ({
  id, label: '', companyName: 'PT RAHASIA SINTETIS', nib: '1234567890123', npwp: '123456789012345', ...patch,
});

test('report includes limitations and matching result but excludes identity field values', () => {
  const text = formatIdentityReport([row('a', { label: 'Akta' }), row('b')]);
  for (const expected of ['DRAF INTERNAL', 'Akta', 'Berkas 2 (tanpa nama)', 'Tidak ada perbedaan', 'bukan jaminan', 'snapshot']) assert.ok(text.includes(expected), expected);
  for (const value of ['PT RAHASIA SINTETIS', '1234567890123', '123456789012345']) assert.ok(!text.includes(value));
});

test('report includes all issues, follow-up actions and NPWP manual review', () => {
  const text = formatIdentityReport([row('a'), row('b', { companyName: '', nib: 'x', npwp: '1234567890123456' })]);
  for (const expected of ['Nama badan usaha — Belum diisi', 'NIB — Format tidak sesuai', 'NPWP — Isian berbeda', 'Tindakan:', 'telaah manual diperlukan']) assert.ok(text.includes(expected), expected);
});

test('empty fields cannot generate a passing report and labels cannot inject lines', () => {
  const text = formatIdentityReport([row('a', { label: 'Akta\nPALSU\tjudul', companyName: '', nib: '', npwp: '' }), row('b', { companyName: '', nib: '', npwp: '' })]);
  assert.match(text, /Belum ada kolom yang dapat dibandingkan/);
  assert.doesNotMatch(text, /Tidak ada perbedaan terdeteksi/);
  assert.match(text, /Akta PALSU judul/);
});
