import { validCalendarDate, type ActionItem } from './sbu-mini-apps';

export type BackupAction = Omit<ActionItem, 'id'>;
export const MAX_BACKUP_BYTES = 256 * 1024;
const invalid = () => new Error('Cadangan tidak valid. Gunakan JSON cadangan Pelacak Tindakan versi 1 (maksimal 200 tindakan / 256 KiB).');
export const actionKey = (row: BackupAction) => JSON.stringify([row.title, row.responsible, row.dueOn, row.status]);

export function parseActionBackup(text: string): BackupAction[] {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw invalid();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw invalid(); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid();
  const object = data as Record<string, unknown>;
  if (Object.keys(object).some(key => !['format', 'version', 'actions'].includes(key)) ||
    object.format !== 'gustafta-sbu-actions' || object.version !== 1 ||
    !Array.isArray(object.actions) || object.actions.length > 200) throw invalid();
  return object.actions.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalid();
    const row = entry as Record<string, unknown>;
    if (Object.keys(row).length !== 4 ||
      Object.keys(row).some(key => !['title', 'responsible', 'dueOn', 'status'].includes(key)) ||
      typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200 ||
      typeof row.responsible !== 'string' || row.responsible.length > 120 ||
      typeof row.dueOn !== 'string' || (row.dueOn !== '' && !validCalendarDate(row.dueOn)) ||
      !['open', 'done'].includes(row.status as string)) throw invalid();
    return { title: row.title, responsible: row.responsible, dueOn: row.dueOn, status: row.status as BackupAction['status'] };
  });
}

export function serializeActionBackup(rows: ActionItem[]): string {
  const text = JSON.stringify({
    format: 'gustafta-sbu-actions', version: 1,
    actions: rows.map(({ title, responsible, dueOn, status }) => ({ title, responsible, dueOn, status })),
  }, null, 2);
  parseActionBackup(text);
  return text;
}
