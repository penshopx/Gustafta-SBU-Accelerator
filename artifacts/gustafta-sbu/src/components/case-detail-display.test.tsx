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

test('ringkasan kasus tetap terbaca saat timestamp kosong atau rusak', () => {
  for (const [timestamp, expected] of [
    ['', '—'], ['bukan-tanggal', 'Tanggal tidak valid'],
    ['2026-13-01T00:00:00Z', 'Tanggal tidak valid'],
  ]) {
    const html = renderToStaticMarkup(createElement(CaseSummary, {
      sbuCase: { ...sbuCase, createdAt: timestamp, updatedAt: timestamp },
    }));
    assert.ok(html.includes(`Dibuat ${expected} · Diperbarui ${expected}</div>`));
    assert.match(html, /RINGKASAN KASUS/);
    assert.match(html, /15 Apr 2027/);
    assert.doesNotMatch(html, /Invalid Date|1 Jan 1970/);
  }
});

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

test('label penilaian eksplisit tanpa mengubah data penilaian atau ringkasan kasus', () => {
  for (const requestType of ['baru', 'perpanjangan'] as const) {
    const input: Assessment = {
      ...assessment,
      status: 'perlu_bukti',
      recordedCount: 1,
      requiredCount: 2,
      findings: [
        { code: 'legalitas', title: 'Legalitas', status: 'tercatat', detail: 'Belum diverifikasi.', source: 'Fixture' },
        { code: 'keuangan', title: 'Keuangan', status: 'perlu_bukti', detail: 'Belum ada catatan.', source: 'Fixture' },
      ],
    };
    const before = structuredClone(input);
    const summary = renderToStaticMarkup(createElement(CaseSummary, {
      sbuCase: { ...sbuCase, requestType },
    }));
    const html = renderToStaticMarkup(createElement(AssessmentResults, { assessment: input }));
    assert.match(summary, /status-draf/);
    assert.match(html, /<h3[^>]*>Perlu catatan bukti<\/h3>/);
    assert.match(html, /data-testid="status-perlu_bukti"[^>]*>[\s\S]*?Perlu catatan bukti<\/span>/);
    assert.match(html, /data-testid="status-tercatat"[^>]*>[\s\S]*?Tercatat, belum diverifikasi<\/span>/);
    assert.deepEqual(input, before);
    assert.equal(input.findings.filter(finding => finding.status === 'perlu_bukti').length, 1);
  }
});

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
  // Literal LA dates, with each instant represented in Z, -08:00, and -07:00.
  // Fixed offsets remain valid even when that offset is not active in LA.
  const dstOffsetCases = [
    ['7 Mar 2026', '2026-03-08T07:30:00.000Z', '2026-03-07T23:30:00.000-08:00', '2026-03-08T00:30:00.000-07:00'],
    ['8 Mar 2026', '2026-03-08T08:30:00.000Z', '2026-03-08T00:30:00.000-08:00', '2026-03-08T01:30:00.000-07:00'],
    // The spring jump from 01:59:59.999 PST to 03:00 PDT.
    ['8 Mar 2026', '2026-03-08T09:59:59.999Z', '2026-03-08T01:59:59.999-08:00', '2026-03-08T02:59:59.999-07:00'],
    ['8 Mar 2026', '2026-03-08T10:00:00.000Z', '2026-03-08T02:00:00.000-08:00', '2026-03-08T03:00:00.000-07:00'],
    ['8 Mar 2026', '2026-03-09T06:30:00.000Z', '2026-03-08T22:30:00.000-08:00', '2026-03-08T23:30:00.000-07:00'],
    ['9 Mar 2026', '2026-03-09T07:30:00.000Z', '2026-03-08T23:30:00.000-08:00', '2026-03-09T00:30:00.000-07:00'],
    ['31 Okt 2026', '2026-11-01T06:30:00.000Z', '2026-10-31T22:30:00.000-08:00', '2026-10-31T23:30:00.000-07:00'],
    ['1 Nov 2026', '2026-11-01T07:30:00.000Z', '2026-10-31T23:30:00.000-08:00', '2026-11-01T00:30:00.000-07:00'],
    // Two different instants share the local 01:30 wall clock: PDT, then PST.
    ['1 Nov 2026', '2026-11-01T08:30:00.000Z', '2026-11-01T00:30:00.000-08:00', '2026-11-01T01:30:00.000-07:00'],
    ['1 Nov 2026', '2026-11-01T09:30:00.000Z', '2026-11-01T01:30:00.000-08:00', '2026-11-01T02:30:00.000-07:00'],
    ['1 Nov 2026', '2026-11-02T07:30:00.000Z', '2026-11-01T23:30:00.000-08:00', '2026-11-02T00:30:00.000-07:00'],
    ['2 Nov 2026', '2026-11-02T08:30:00.000Z', '2026-11-02T00:30:00.000-08:00', '2026-11-02T01:30:00.000-07:00'],
  ] as const;
  for (const [, utc, standard, daylight] of dstOffsetCases) {
    assert.equal(Date.parse(standard), Date.parse(utc), `${standard} harus setara dengan ${utc}`);
    assert.equal(Date.parse(daylight), Date.parse(utc), `${daylight} harus setara dengan ${utc}`);
  }
  // Literal St_Johns dates and getTimezoneOffset minutes, independent of the formatter.
  const stJohnsCases = [
    // Summer midnight (UTC-02:30) and winter year boundary (UTC-03:30).
    ['26 Sep 2026', '2026-09-27T02:29:59.999Z', 150],
    ['27 Sep 2026', '2026-09-27T02:30:00.000Z', 150],
    ['31 Des 2026', '2027-01-01T03:29:59.999Z', 210],
    ['1 Jan 2027', '2027-01-01T03:30:00.000Z', 210],
    ['1 Jan 2027', '2027-01-01T00:00:00.000-03:30', 210],
    // March 8: midnight, jump from 01:59:59.999 NST to 03:00 NDT, next midnight.
    ['7 Mar 2026', '2026-03-08T03:29:59.999Z', 210],
    ['8 Mar 2026', '2026-03-08T03:30:00.000Z', 210],
    ['8 Mar 2026', '2026-03-08T05:29:59.999Z', 210],
    ['8 Mar 2026', '2026-03-08T05:30:00.000Z', 150],
    ['8 Mar 2026', '2026-03-08T03:00:00.000-02:30', 150],
    ['8 Mar 2026', '2026-03-09T02:29:59.999Z', 150],
    ['9 Mar 2026', '2026-03-09T02:30:00.000Z', 150],
    // November 1: midnight, rollback from 01:59:59.999 NDT to 01:00 NST, next midnight.
    ['31 Okt 2026', '2026-11-01T02:29:59.999Z', 150],
    ['1 Nov 2026', '2026-11-01T02:30:00.000Z', 150],
    ['1 Nov 2026', '2026-11-01T04:29:59.999Z', 150],
    ['1 Nov 2026', '2026-11-01T04:30:00.000Z', 210],
    ['1 Nov 2026', '2026-11-01T01:00:00.000-03:30', 210],
    ['1 Nov 2026', '2026-11-02T03:29:59.999Z', 210],
    ['2 Nov 2026', '2026-11-02T03:30:00.000Z', 210],
  ] as const;
  const expectedByZone: Record<string, string[]> = {
    UTC: ['1 Jan 2027', '31 Des 2026', '31 Des 2026', '31 Des 2026', '1 Jan 2027'],
    'America/St_Johns': [
      '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026',
      ...stJohnsCases.map(([date]) => date),
    ],
    'America/Los_Angeles': [
      '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026', '31 Des 2026',
      ...dstOffsetCases.flatMap(([date]) => [date, date, date]),
    ],
    'Australia/Sydney': [
      '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027',
      '4 Apr 2026', '5 Apr 2026', '5 Apr 2026', '6 Apr 2026',
      '3 Okt 2026', '4 Okt 2026', '4 Okt 2026', '5 Okt 2026',
    ],
    'Asia/Jakarta': ['1 Jan 2027', '1 Jan 2027', '31 Des 2026', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Tokyo': ['1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027'],
    'Asia/Kathmandu': [
      '1 Jan 2027', '1 Jan 2027', '31 Des 2026', '31 Des 2026', '1 Jan 2027',
      '26 Sep 2026', '27 Sep 2026', '31 Des 2026', '1 Jan 2027', '1 Jan 2027',
    ],
    'Pacific/Kiritimati': [
      '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027', '1 Jan 2027',
      '26 Sep 2026', '27 Sep 2026', '31 Des 2026', '1 Jan 2027', '1 Jan 2027',
    ],
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
  // ICU may canonicalize Asia/Kathmandu to the equivalent Asia/Katmandu.
  assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Intl.DateTimeFormat('id-ID', { timeZone: zone }).resolvedOptions().timeZone);
  const expected = expectedByZone[zone];
  assert.ok(expected, `zona pengujian dikenal: ${zone}`);
  if (zone === 'America/St_Johns') {
    for (const [, timestamp, offset] of stJohnsCases) {
      assert.equal(new Date(timestamp).getTimezoneOffset(), offset, `${timestamp}: offset St_Johns`);
    }
  }
  const updates = [
    '2027-01-01T00:30:00.000Z',
    '2026-12-31T23:30:00.000Z',
    '2026-12-31T16:30:00.000Z', // Jakarta is still December; Tokyo is January.
    '2026-12-31T17:30:00.000Z', // Jakarta has now crossed midnight.
    '2027-01-01T07:30:00.000+07:00', // Same instant as the first value.
    ...(zone === 'America/St_Johns' ? stJohnsCases.map(([, timestamp]) => timestamp) : []),
    ...(zone === 'Asia/Kathmandu' ? [
      // UTC+05:45: midnight is 18:15Z, not an hour-aligned boundary.
      '2026-09-26T18:14:59.999Z', '2026-09-26T18:15:00.000Z',
      '2026-12-31T18:14:59.999Z', '2026-12-31T18:15:00.000Z',
      '2027-01-01T00:00:00.000+05:45', // Same year-boundary instant.
    ] : []),
    ...(zone === 'Pacific/Kiritimati' ? [
      // UTC+14: the local date rolls over while UTC is still in the morning.
      '2026-09-26T09:59:59.999Z', '2026-09-26T10:00:00.000Z',
      '2026-12-31T09:59:59.999Z', '2026-12-31T10:00:00.000Z',
      '2027-01-01T00:00:00.000+14:00',
    ] : []),
    ...(zone === 'America/Los_Angeles'
      ? dstOffsetCases.flatMap(([, utc, standard, daylight]) => [utc, standard, daylight]) : []),
    ...(zone === 'Australia/Sydney' ? [
      // DST ends April 5 (UTC+11 -> UTC+10): midnight moves from 13:00Z to 14:00Z.
      '2026-04-04T12:59:59.999Z', '2026-04-04T13:00:00.000Z',
      '2026-04-05T13:59:59.999Z', '2026-04-05T14:00:00.000Z',
      // DST starts October 4 (UTC+10 -> UTC+11): midnight moves back to 13:00Z.
      '2026-10-03T13:59:59.999Z', '2026-10-03T14:00:00.000Z',
      '2026-10-04T12:59:59.999Z', '2026-10-04T13:00:00.000Z',
    ] : []),
  ];
  assert.equal(updates.length, expected.length);
  for (const [index, updatedAt] of updates.entries()) {
    for (const [calendarDay, formattedDay] of [
      ['2026-12-31', '31 Des 2026'],
      ['2027-01-01', '1 Jan 2027'],
      ['2026-03-08', '8 Mar 2026'],
      ['2026-11-01', '1 Nov 2026'],
      ['2026-04-05', '5 Apr 2026'],
      ['2026-04-06', '6 Apr 2026'],
      ['2026-10-04', '4 Okt 2026'],
      ['2026-10-05', '5 Okt 2026'],
    ]) {
      for (const expiry of [calendarDay, `${calendarDay}T00:00:00.000Z`]) {
        const summary = renderToStaticMarkup(createElement(CaseSummary, {
          sbuCase: {
            // 08:00Z stays August 1 in every tested zone, including UTC+14.
            ...sbuCase, createdAt: '2026-08-01T08:00:00.000Z',
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
    for (const tz of ['UTC', 'America/Los_Angeles', 'America/St_Johns', 'Australia/Sydney', 'Asia/Jakarta', 'Asia/Tokyo', 'Asia/Kathmandu', 'Pacific/Kiritimati']) {
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

  assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Intl.DateTimeFormat('id-ID', { timeZone: process.env.TZ! }).resolvedOptions().timeZone);
  assert.equal(formatCalendarDate(sbuCase.existingSbuExpiresOn), '15 Apr 2027');
  assert.equal(formatCalendarDate('2027-04-15T00:00:00.000Z'), '15 Apr 2027');
  assert.equal(formatCalendarDate(null), '—');
  for (const [calendarDay, formattedDay] of [
    ['2027-01-01', '1 Jan 2027'], ['2027-04-15', '15 Apr 2027'],
    ['2026-03-08', '8 Mar 2026'], ['2026-03-09', '9 Mar 2026'],
    ['2026-11-01', '1 Nov 2026'], ['2026-11-02', '2 Nov 2026'],
    ['2026-04-05', '5 Apr 2026'], ['2026-04-06', '6 Apr 2026'],
    ['2026-10-04', '4 Okt 2026'], ['2026-10-05', '5 Okt 2026'],
  ]) {
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