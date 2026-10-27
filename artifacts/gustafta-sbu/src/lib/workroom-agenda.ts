import type { WorkroomItem } from '@workspace/api-client-react';

export type AgendaBucket = 'overdue' | 'today' | 'soon' | 'later' | 'undated' | 'invalid' | 'done';
export type AgendaFilter = 'open' | 'overdue' | 'today' | 'week' | 'undated' | 'done' | 'all';
export type AgendaEntry = { item: WorkroomItem; bucket: AgendaBucket; days: number | null };

const DAY = 86_400_000;
/** Calendar dates must never be coerced from timestamps or rolled over by Date. */
export function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

export function jakartaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function buildAgenda(items: readonly WorkroomItem[], today: string): AgendaEntry[] {
  const base = calendarDay(today);
  if (base === null) throw new Error('Tanggal acuan agenda tidak valid.');
  const rank: Record<AgendaBucket, number> = { overdue: 0, today: 1, soon: 2, later: 3, undated: 4, invalid: 5, done: 6 };
  return items.filter(item => item.kind === 'action').map(item => {
    const due = item.dueOn === null ? null : calendarDay(item.dueOn);
    const days = due === null ? null : (due - base) / DAY;
    const bucket: AgendaBucket = item.status === 'done' ? 'done'
      : item.dueOn === null ? 'undated' : days === null ? 'invalid'
        : days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later';
    return { item, bucket, days };
  }).sort((a, b) => rank[a.bucket] - rank[b.bucket]
    || (a.days ?? Infinity) - (b.days ?? Infinity)
    || a.item.title.localeCompare(b.item.title, 'id') || a.item.id.localeCompare(b.item.id));
}

export function filterAgenda(entries: readonly AgendaEntry[], filter: AgendaFilter, search = ''): AgendaEntry[] {
  const term = search.trim().toLocaleLowerCase('id');
  return entries.filter(({ item, bucket }) => {
    const match = filter === 'all' || (filter === 'open' && bucket !== 'done')
      || (filter === 'overdue' && bucket === 'overdue')
      || (filter === 'today' && bucket === 'today')
      || (filter === 'week' && (bucket === 'today' || bucket === 'soon'))
      || (filter === 'undated' && (bucket === 'undated' || bucket === 'invalid'))
      || (filter === 'done' && bucket === 'done');
    return match && (!term || `${item.title} ${item.assignee} ${item.body}`.toLocaleLowerCase('id').includes(term));
  });
}

export function calendarCandidates(items: readonly WorkroomItem[]): WorkroomItem[] {
  return items.filter(item => item.kind === 'action' && item.status !== 'done'
    && item.dueOn !== null && calendarDay(item.dueOn) !== null);
}

const escapeIcs = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
// RFC 5545 folding counts UTF-8 octets, not UTF-16 units; never split Unicode.
function fold(line: string): string {
  const lines: string[] = [];
  let current = '', size = 0;
  const encoder = new TextEncoder();
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) { lines.push(current); current = ' '; size = 1; }
    current += char; size += bytes;
  }
  lines.push(current);
  return lines.join('\r\n');
}

/** Explicit local export only. No descriptions, assignees, URLs, or document bytes. */
export function agendaCalendar(caseId: number, items: readonly WorkroomItem[], now = new Date()): string {
  if (!Number.isSafeInteger(caseId) || caseId < 1 || items.some(item => item.caseId !== caseId)) {
    throw new Error('Data agenda tidak cocok dengan kasus ini.');
  }
  const selected = calendarCandidates(items);
  if (!selected.length) throw new Error('Belum ada tindakan aktif dengan tenggat valid.');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SBU Accelerator//Agenda Internal//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const item of selected) {
    if (!/^[a-zA-Z0-9-]+$/.test(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 0) {
      throw new Error('Identitas tindakan tidak valid.');
    }
    const due = calendarDay(item.dueOn!)!;
    const end = new Date(due + DAY).toISOString().slice(0, 10);
    if (calendarDay(end) === null) throw new Error('Tenggat berada di luar rentang kalender.');
    lines.push('BEGIN:VEVENT', `UID:case-${caseId}-action-${item.id}@sbu-accelerator.local`,
      `DTSTAMP:${stamp}`, `SEQUENCE:${item.revision}`,
      `DTSTART;VALUE=DATE:${item.dueOn!.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${end.replace(/-/g, '')}`,
      `SUMMARY:${escapeIcs(item.title)}`, 'CLASS:PRIVATE', 'TRANSP:TRANSPARENT',
      'DESCRIPTION:Pengingat persiapan internal SBU. Bukan tenggat resmi atau persetujuan sertifikasi.',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
