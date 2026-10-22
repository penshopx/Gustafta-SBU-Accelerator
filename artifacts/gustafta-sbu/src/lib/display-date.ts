const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const calendarFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// A date-only value is a calendar day, not an instant in the viewer's time zone.
export function formatCalendarDate(value?: string | null): string {
  if (!value) return '—';
  // The API may serialize a date-only field as a UTC-midnight ISO timestamp.
  // In both forms the leading YYYY-MM-DD is the calendar day to display.
  return calendarFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export function formatTimestampDate(value?: string | null): string {
  // Updates are instants displayed in the viewer's local zone, unlike SBU calendar days.
  // Keep the zone's seasonal rules: a fixed UTC offset would misdate updates near midnight.
  if (!value) return '—';
  const date = new Date(value);
  // Do not invent a replacement date or hide corrupt data as an absent value.
  if (!Number.isFinite(date.getTime())) return 'Tanggal tidak valid';
  return formatter.format(date);
}