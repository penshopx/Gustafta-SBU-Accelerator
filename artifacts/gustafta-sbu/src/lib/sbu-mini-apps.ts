/** Local preparation tools: no statutory duration or certification decisions. */
export type ActionItem = {
  id: string;
  title: string;
  responsible: string;
  dueOn: string;
  status: 'open' | 'done';
};

function calendarMillis(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

export function validCalendarDate(value: string): boolean {
  return calendarMillis(value) !== null;
}

export function calculateExpiry(expiresOn: string, asOf: string): {
  days: number; status: 'expired' | 'today' | 'upcoming';
} | null {
  const end = calendarMillis(expiresOn);
  const start = calendarMillis(asOf);
  if (end === null || start === null) return null;
  const days = Math.round((end - start) / 86_400_000);
  return { days, status: days < 0 ? 'expired' : days === 0 ? 'today' : 'upcoming' };
}

export function actionReport(rows: ActionItem[]): string {
  return [
    'TINDAK LANJUT PERSIAPAN SBU — DRAF INTERNAL',
    'Catatan manual, bukan hasil verifikasi dokumen atau persetujuan LSBU/OSS.',
    'Tidak mengubah bukti, penilaian, atau kasus SBU.',
    '',
    ...rows.flatMap((row, index) => [
      `${index + 1}. ${row.title}`,
      `Penanggung jawab: ${row.responsible.trim() || 'Belum ditentukan'}`,
      `Tenggat: ${row.dueOn || 'Belum ditentukan'}`,
      `Status: ${row.status === 'done' ? 'Selesai (deklarasi pengguna)' : 'Terbuka'}`,
      '',
    ]),
    ...(rows.length === 0 ? ['Belum ada tindak lanjut.'] : []),
  ].join('\n');
}
