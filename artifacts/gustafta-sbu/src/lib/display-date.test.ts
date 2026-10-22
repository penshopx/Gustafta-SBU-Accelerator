import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCalendarDate, formatTimestampDate } from './display-date';

test('timestamp kosong tetap kosong dan timestamp rusak ditandai tanpa melempar', () => {
  for (const value of [undefined, null, '']) {
    assert.equal(formatTimestampDate(value), '—');
  }
  for (const value of ['bukan-tanggal', ' ', '2026-99-99T00:00:00Z', '2026-10-22T25:00:00Z', '999999-01-01T00:00:00Z']) {
    assert.equal(formatTimestampDate(value), 'Tanggal tidak valid', value);
  }
});

test('timestamp valid mengikuti zona lokal sedangkan tanggal kalender SBU tetap UTC', () => {
  const instant = '2027-01-01T00:30:00.000Z';
  assert.equal(formatTimestampDate(instant),
    new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(instant)));
  assert.equal(formatCalendarDate('2027-04-15'), '15 Apr 2027');
  assert.equal(formatCalendarDate('2027-04-15T00:00:00.000Z'), '15 Apr 2027');
});
