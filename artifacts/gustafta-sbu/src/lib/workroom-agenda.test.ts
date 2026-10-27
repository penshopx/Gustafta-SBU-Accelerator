import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkroomItem } from '@workspace/api-client-react';
import { agendaCalendar, buildAgenda, calendarCandidates, calendarDay, filterAgenda, jakartaToday } from './workroom-agenda';

const item = (id: string, dueOn: string | null, extra: Partial<WorkroomItem> = {}): WorkroomItem => ({
  id, caseId: 12, kind: 'action', title: `Tindakan ${id}`, body: 'Catatan rahasia',
  assignee: 'Penanggung jawab privat', status: 'todo', dueOn, revision: 1,
  createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z', ...extra,
});

test('calendar-day parsing rejects rollover, timestamps and blanks, while WIB crosses midnight correctly', () => {
  for (const value of ['', '2026-02-29', '2026-13-01', '2026-04-31', '2026-10-27T00:00:00Z', '26-1-1']) {
    assert.equal(calendarDay(value), null, value);
  }
  assert.notEqual(calendarDay('2028-02-29'), null);
  assert.equal(jakartaToday(new Date('2026-10-27T16:59:59Z')), '2026-10-27');
  assert.equal(jakartaToday(new Date('2026-10-27T17:00:00Z')), '2026-10-28');
});

test('agenda ranks only actions, preserves inputs, and separates invalid, undated and completed tasks', () => {
  const input = [
    item('later', '2026-11-04'), item('none', null), item('today', '2026-10-27'),
    item('week', '2026-11-03'), item('yesterday', '2026-10-26'),
    item('bad', '2026-02-31'), item('done', '2026-01-01', { status: 'done' }),
    item('check', '2026-10-01', { kind: 'checklist' }), item('journal', null, { kind: 'journal' }),
  ];
  const original = structuredClone(input);
  const result = buildAgenda(input, '2026-10-27');
  assert.deepEqual(result.map(e => [e.item.id, e.bucket]), [
    ['yesterday', 'overdue'], ['today', 'today'], ['week', 'soon'], ['later', 'later'],
    ['none', 'undated'], ['bad', 'invalid'], ['done', 'done'],
  ]);
  assert.deepEqual(input, original);
  assert.equal(filterAgenda(result, 'week').length, 2);
  assert.equal(filterAgenda(result, 'open').length, 6);
  assert.equal(filterAgenda(result, 'done')[0].item.id, 'done');
  assert.equal(filterAgenda(result, 'undated').length, 2);
  assert.equal(filterAgenda(result, 'overdue').length, 1);
  assert.equal(filterAgenda(result, 'all', 'RAHASIA').length, 7);
  assert.equal(filterAgenda(result, 'all', 'tidak ditemukan').length, 0);
  assert.throws(() => buildAgenda(input, 'bad'), /tidak valid/);
});

test('midnight and year rollover change agenda urgency, not the declared due date', () => {
  const data = [item('year', '2026-12-31')];
  assert.equal(buildAgenda(data, '2026-12-31')[0].bucket, 'today');
  assert.equal(buildAgenda(data, '2027-01-01')[0].bucket, 'overdue');
  assert.equal(data[0].dueOn, '2026-12-31');
});

test('ICS exports active dated actions only, as private all-day events with no private notes or automatic alarm', () => {
  const data = [item('one', '2026-12-31'), item('done', '2026-10-27', { status: 'done' }),
    item('none', null), item('bad', '2026-02-30'), item('check', '2026-10-27', { kind: 'checklist' })];
  assert.equal(calendarCandidates(data).length, 1);
  const ics = agendaCalendar(12, data, new Date('2026-10-27T03:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(ics, /DTSTAMP:20261027T030000Z/);
  assert.match(ics, /UID:case-12-action-one@sbu-accelerator.local/);
  assert.match(ics, /CLASS:PRIVATE/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  for (const value of ['Catatan rahasia', 'Penanggung jawab privat', 'VALARM', 'ATTENDEE', 'ORGANIZER']) assert.ok(!ics.includes(value));
  assert.equal(ics.endsWith('END:VCALENDAR\r\n'), true);
});

test('ICS escapes injected properties, folds UTF-8 safely, and uses stable event identity with updated revision', () => {
  const title = 'Evaluasi 😀 konstruksi, tahap; berikut\\akhir\r\nBEGIN:VEVENT\n'.repeat(5);
  const data = [item('unicode', '2028-02-29', { title, revision: 4 })];
  const ics = agendaCalendar(12, data, new Date('2026-10-27T03:00:00Z'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.equal((ics.match(/(?:^|\r\n)BEGIN:VEVENT/g) ?? []).length, 1);
  assert.match(unfolded, /tahap\\; berikut\\\\akhir\\nBEGIN:VEVENT\\n/);
  assert.ok(unfolded.includes('😀'));
  assert.match(unfolded, /DTEND;VALUE=DATE:20280301/);
  const second = agendaCalendar(12, [{ ...data[0], revision: 5 }]);
  assert.equal(ics.match(/UID:[^\r]+/)?.[0], second.match(/UID:[^\r]+/)?.[0]);
  assert.match(second, /SEQUENCE:5/);
});

test('calendar export refuses cross-case, invalid identity, empty candidates and invalid boundary dates', () => {
  assert.throws(() => agendaCalendar(13, [item('one', '2026-10-27')]), /tidak cocok/);
  assert.throws(() => agendaCalendar(12, [item('bad\nEND:VEVENT', '2026-10-27')]), /tidak valid/);
  assert.throws(() => agendaCalendar(12, [item('none', null)]), /Belum ada/);
  assert.throws(() => agendaCalendar(12, [item('max', '9999-12-31')]), /luar rentang/);
});
