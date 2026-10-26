import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionReport, calculateExpiry, validCalendarDate } from './sbu-mini-apps';

test('calendar tools reject invalid dates without coercing them', () => {
  for (const value of ['', '2027-02-29', '2028-02-30', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01', '2026-01-01T00:00:00Z']) {
    assert.equal(validCalendarDate(value), false, value);
    assert.equal(calculateExpiry(value, '2026-01-01'), null);
    assert.equal(calculateExpiry('2026-01-01', value), null);
  }
  assert.equal(validCalendarDate('2028-02-29'), true);
  assert.equal(validCalendarDate('0099-12-31'), true);
});

test('remaining days are calendar days across leap years, DST, and year boundaries', () => {
  for (const [end, start, expected] of [
    ['2028-03-01', '2028-02-28', 2],
    ['2027-01-01', '2026-12-31', 1],
    ['2026-03-09', '2026-03-07', 2],
    ['2026-11-02', '2026-10-31', 2],
    ['2026-01-01', '2026-01-02', -1],
    ['2026-10-27', '2026-10-27', 0],
  ] as const) {
    assert.deepEqual(calculateExpiry(end, start), {
      days: expected, status: expected < 0 ? 'expired' : expected === 0 ? 'today' : 'upcoming',
    });
  }
});

test('manual report preserves Unicode and clearly states draft and certification limits', () => {
  const rows = [{ id: 'a', title: 'Tinjau SKK — 工程', responsible: 'Tim teknik', dueOn: '2026-12-01', status: 'done' as const }];
  const before = JSON.stringify(rows);
  const report = actionReport(rows);
  for (const text of ['DRAF INTERNAL', 'bukan hasil verifikasi', 'LSBU/OSS', '工程', 'Tim teknik', '2026-12-01', 'deklarasi pengguna']) assert.ok(report.includes(text), text);
  assert.equal(JSON.stringify(rows), before);
  assert.match(actionReport([]), /Belum ada tindak lanjut/);
});
