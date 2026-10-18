import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Assessment, Finding, SbuCase } from '@workspace/api-client-react';
import { GetAssessmentResponse } from '../../../../lib/api-zod/src/generated/api';
import { formatCalendarDate } from '../lib/display-date';
import { expiryInputValue, expiryPayload } from '../lib/case-expiry';
import { AssessmentResults, CaseSummary } from './case-detail-display';

const sbuCase: SbuCase = {
  id: 12,
  companyName: 'Contoh BUJK',
  requestType: 'perpanjangan',
  qualification: 'kecil',
  classification: 'Bangunan gedung',
  status: 'draf',
  existingSbuExpiresOn: '2027-04-15',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
};

// Bentuk respons penilaian perpanjangan sesuai aturan server: tanggal SBU
// adalah data kasus, bukan input untuk menghitung temuan transisi.
const assessment: Assessment = {
  caseId: 12,
  ruleset: 'Permen PU 6/2025 + Kepdirjen 281/KPTS/DK/2026 (persiapan)',
  status: 'perlu_tinjauan',
  recordedCount: 0,
  requiredCount: 3,
  disclaimer: 'Ini daftar persiapan awal, bukan keputusan LSBU.',
  findings: [
    {
      code: 'transisi',
      title: 'Penyesuaian skema LSBU',
      status: 'perlu_tinjauan',
      detail: 'Tenggat LSBU belum layak ditayangkan; tanggal penetapan Kepdirjen bukan pemicu konversi SBU.',
      source: 'Kepdirjen 281/KPTS/DK/2026 diktum KEEMPAT.',
    },
    {
      code: 'transisi_operasional',
      title: 'Pemberlakuan operasional sertifikasi',
      status: 'perlu_tinjauan',
      detail: 'Tanggal mulai layanan belum layak ditayangkan: surat Pasal 20 ayat (2) belum terkonfirmasi.',
      source: 'Permen PU 6/2025 Pasal 20–21.',
    },
    {
      code: 'transisi_konversi',
      title: 'Konversi SBU eksisting',
      status: 'perlu_tinjauan',
      detail: 'Tanggal/hitung mundur konversi belum layak ditayangkan. Pemicu konversi adalah surat Pasal 20 ayat (2), yang belum terkonfirmasi.',
      source: 'Permen PU 6/2025 Pasal 20–21.',
    },
  ],
};

test('detail perpanjangan menampilkan kedaluwarsa hanya sebagai masa berlaku SBU, bukan tenggat konversi', () => {
  const summary = renderToStaticMarkup(createElement(CaseSummary, { sbuCase }));
  const findings = renderToStaticMarkup(createElement(AssessmentResults, { assessment }));
  const formattedExpiry = '15 Apr 2027';

  assert.match(summary, new RegExp(`Berlaku hingga[\\s\\S]*${formattedExpiry}`));
  assert.equal(summary.split(formattedExpiry).length - 1, 1);
  assert.doesNotMatch(summary, /konversi|tenggat|hitung mundur/i);
  assert.match(findings, /Konversi SBU eksisting/);
  assert.match(findings, /surat Pasal 20 ayat \(2\), yang belum terkonfirmasi/);
  assert.doesNotMatch(findings, /15 Apr 2027|2027-04-15|15[/.]0?4[/.]2027/);
  assert.doesNotMatch(findings, /\b\d+\s*(?:hari|jam|menit|detik)\s*(?:lagi|tersisa)\b/i);
  assert.doesNotMatch(findings, /(?:tenggat|batas|konversi)\s*(?:hingga|pada|jatuh tempo)\s*\d/i);
});

test('tanggal transisi hanya tampil bila temuan terverifikasi oleh server', () => {
  const pendingResponse: Assessment = JSON.parse(JSON.stringify(GetAssessmentResponse.parse(assessment)));
  assert.ok(pendingResponse.findings.every((finding) => finding.transitionDate === undefined));
  const pending = renderToStaticMarkup(createElement(AssessmentResults, { assessment: pendingResponse }));
  assert.doesNotMatch(pending, /Tanggal transisi terverifikasi/);
  const verifiedFinding: Finding = {
    ...assessment.findings[2],
    status: 'tercatat',
    transitionDate: '2026-10-30',
  };
  const approvedResponse: Assessment = JSON.parse(JSON.stringify(GetAssessmentResponse.parse({
    ...assessment,
    findings: assessment.findings.map((finding) => finding.code === 'transisi_konversi'
      ? verifiedFinding
      : finding),
  })));
  assert.equal(approvedResponse.findings[2].transitionDate, '2026-10-30T00:00:00.000Z');
  const approved = renderToStaticMarkup(createElement(AssessmentResults, {
    assessment: approvedResponse,
  }));
  assert.match(approved, /Tanggal transisi terverifikasi: 30 Okt 2026/);
  assert.doesNotMatch(approved, /Tanggal transisi terverifikasi: 15 Apr 2027/);
});

test('tanggal pembaruan detail kasus mengikuti zona waktu penonton tanpa mengubah tanggal SBU', () => {
  const expectedByZone: Record<string, string[]> = {
    UTC: ['1 Jan 2027', '31 Des 2026', '31 Des 2026', '31 Des 2026', '1 Jan 2027'],
    'America/Los_Angeles': [
      '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026',
      '7 Mar 2026', '8 Mar 2026', '8 Mar 2026', '9 Mar 2026',
      '31 Okt 2026', '1 Nov 2026', '1 Nov 2026', '2 Nov 2026',
    ],
    'Asia/Jakarta': ['1 Jan 2027', '1 Jan 2027', '31 Des 2026', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Tokyo': ['1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027'],
  };
  if (!process.env.CASE_DETAIL_TZ_CHILD) {
    // TZ must be set before importing the module-scoped local formatter.
    for (const tz of Object.keys(expectedByZone)) {
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', '--test', '--test-reporter=tap',
        '--test-name-pattern', 'tanggal pembaruan detail kasus mengikuti zona waktu',
        fileURLToPath(import.meta.url),
      ], {
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, TZ: tz, CASE_DETAIL_TZ_CHILD: '1' },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${tz}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /# pass 1\b/, `${tz}: uji detail harus benar-benar dijalankan`);
    }
    return;
  }

  const zone = process.env.TZ!;
  assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone, zone);
  const expected = expectedByZone[zone];
  assert.ok(expected, `zona pengujian dikenal: ${zone}`);
  const updates = [
    '2027-01-01T00:30:00.000Z',
    '2026-12-31T23:30:00.000Z',
    '2026-12-31T16:30:00.000Z', // Jakarta is still December; Tokyo is January.
    '2026-12-31T17:30:00.000Z', // Jakarta has now crossed midnight.
    '2027-01-01T07:30:00.000+07:00', // Same instant as the first value.
    ...(zone === 'America/Los_Angeles' ? [
      // DST starts March 8: midnight changes from 08:00Z to 07:00Z.
      '2026-03-08T07:30:00.000Z', '2026-03-08T08:30:00.000Z',
      '2026-03-09T06:30:00.000Z', '2026-03-09T07:30:00.000Z',
      // DST ends November 1: midnight changes from 07:00Z to 08:00Z.
      '2026-11-01T06:30:00.000Z', '2026-11-01T07:30:00.000Z',
      '2026-11-02T07:30:00.000Z', '2026-11-02T08:30:00.000Z',
    ] : []),
  ];
  assert.equal(updates.length, expected.length);
  for (const [index, updatedAt] of updates.entries()) {
    for (const [calendarDay, formattedDay] of [
      ['2027-01-01', '1 Jan 2027'],
      ['2026-03-08', '8 Mar 2026'],
      ['2026-11-01', '1 Nov 2026'],
    ]) {
      for (const expiry of [calendarDay, `${calendarDay}T00:00:00.000Z`]) {
        const summary = renderToStaticMarkup(createElement(CaseSummary, {
          sbuCase: {
            ...sbuCase, createdAt: '2026-08-01T12:00:00.000Z',
            updatedAt, existingSbuExpiresOn: expiry,
          },
        }));
        assert.ok(summary.includes(`Dibuat 1 Agu 2026 · Diperbarui ${expected[index]}</div>`),
          `${updatedAt} di ${zone} harus menampilkan pembaruan ${expected[index]}`);
        assert.match(summary, new RegExp(`Berlaku hingga[\\s\\S]*?${formattedDay}`));
        assert.doesNotMatch(summary, /Diperbarui 1 Agu 2026/);
      }
    }
  }
});

test('tanggal berlaku tetap tanggal kalender yang sama saat ditampilkan di berbagai zona waktu', () => {
  if (!process.env.CALENDAR_TZ_CHILD) {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Jakarta', 'Asia/Tokyo']) {
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', '--test', '--test-reporter=tap',
        '--test-name-pattern', 'tanggal berlaku tetap tanggal kalender',
        fileURLToPath(import.meta.url),
      ], {
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, TZ: tz, CALENDAR_TZ_CHILD: '1' },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${tz}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /# pass 1\b/, `${tz}: uji kalender harus benar-benar dijalankan`);
    }
    return;
  }

  assert.equal(formatCalendarDate(sbuCase.existingSbuExpiresOn), '15 Apr 2027');
  assert.equal(formatCalendarDate('2027-04-15T00:00:00.000Z'), '15 Apr 2027');
  assert.equal(formatCalendarDate(null), '—');
  for (const [calendarDay, formattedDay] of [['2027-01-01', '1 Jan 2027'], ['2027-04-15', '15 Apr 2027']]) {
    for (const expiry of [calendarDay, `${calendarDay}T00:00:00.000Z`]) {
      assert.equal(expiryInputValue(expiry), calendarDay, 'input edit mengikuti tanggal dari API');
      assert.equal(expiryPayload('perpanjangan', expiryInputValue(expiry)), calendarDay);
      const summary = renderToStaticMarkup(createElement(CaseSummary, {
        sbuCase: { ...sbuCase, existingSbuExpiresOn: expiry },
      }));
      assert.match(summary, new RegExp(`Berlaku hingga[\\s\\S]*${formattedDay}`));
      assert.doesNotMatch(summary, /14 Apr 2027|31 Des 2026/);
    }
  }
  assert.equal(expiryPayload('baru', '2027-04-15'), null);
  assert.equal(expiryPayload('perpanjangan', ''), null);
});