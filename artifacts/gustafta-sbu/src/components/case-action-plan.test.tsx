import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import type { Assessment } from '@workspace/api-client-react';
import { CaseActionPlan } from './case-action-plan';

const assessment: Assessment = {
  caseId: 1,
  ruleset: 'persiapan',
  status: 'perlu_bukti',
  recordedCount: 0,
  requiredCount: 3,
  disclaimer: 'Bukan keputusan LSBU.',
  findings: [
    { code: 'legalitas', title: 'Legalitas', status: 'perlu_bukti', detail: 'Belum dicatat.', source: 'Skema' },
    { code: 'smap', title: 'SMAP', status: 'perlu_bukti', detail: 'Pilih jalur yang sesuai.', source: 'Lampiran' },
    { code: 'transisi_konversi', title: 'Konversi', status: 'perlu_tinjauan', detail: 'Belum terverifikasi.', source: 'Pasal 20' },
  ],
};

test('rencana aksi memisahkan pekerjaan pemohon dari verifikasi eksternal', () => {
  const html = renderToStaticMarkup(createElement(CaseActionPlan, { assessment, onRecord() {} }));
  assert.match(html, /2 kebutuhan belum dicatat/);
  assert.match(html, /1 alur transisi menunggu verifikasi sumber/);
  assert.match(html, /button-record-legalitas/);
  assert.match(html, /button-record-smap/);
  assert.doesNotMatch(html, /button-record-transisi_konversi/);
  assert.doesNotMatch(html, /Tanggal transisi terverifikasi/);
});

test('tombol aksi membuka kategori sesuai kebutuhan, SMAP tetap memilih jalur sendiri', async () => {
  const testGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalAct = testGlobals.IS_REACT_ACT_ENVIRONMENT;
  testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  const selected: string[] = [];
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(createElement(CaseActionPlan, {
      assessment, onRecord: code => selected.push(code),
    }));
  });
  try {
    await act(async () => { renderer!.root.findByProps({ 'data-testid': 'button-record-legalitas' }).props.onClick(); });
    await act(async () => { renderer!.root.findByProps({ 'data-testid': 'button-record-smap' }).props.onClick(); });
    assert.deepEqual(selected, ['legalitas', '']);
  } finally {
    await act(async () => { renderer?.unmount(); });
    testGlobals.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});

test('semua kategori tercatat tidak diklaim sebagai kelayakan', () => {
  const complete = { ...assessment, findings: assessment.findings.map(finding =>
    finding.code === 'transisi_konversi' ? finding : { ...finding, status: 'tercatat' as const }) };
  const html = renderToStaticMarkup(createElement(CaseActionPlan, { assessment: complete, onRecord() {} }));
  assert.match(html, /Tidak ada kategori persiapan yang belum dicatat/);
  assert.match(html, /keaslian dokumen tetap perlu diperiksa/);
  assert.doesNotMatch(html, /button-record-/);
});