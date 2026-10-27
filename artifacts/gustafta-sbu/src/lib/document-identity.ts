/** Manual consistency checks only: no registry lookup or authenticity claims. */
export type IdentityRow = {
  id: string;
  label: string;
  companyName: string;
  nib: string;
  npwp: string;
};
type IdentityField = 'companyName' | 'nib' | 'npwp';
export type IdentityComparison = {
  issues: { field: IdentityField; kind: 'missing' | 'format' | 'mismatch'; documentIds: string[] }[];
  comparableFields: number;
  documentCount: number;
};

function normalize(field: IdentityField, value: string): string {
  const text = value.normalize('NFKC').trim();
  if (field === 'companyName') return text.replace(/\s+/gu, ' ').toLocaleUpperCase('id-ID');
  if (field === 'nib') return text.replace(/\s/gu, '');
  return text.replace(/[.\s-]/gu, '');
}

export function compareDocumentIdentities(rows: IdentityRow[]): IdentityComparison {
  if (rows.length < 2 || rows.length > 8) throw new RangeError('Bandingkan 2 sampai 8 berkas.');
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Identitas baris harus unik.');
  const result: IdentityComparison = { issues: [], comparableFields: 0, documentCount: rows.length };
  for (const field of ['companyName', 'nib', 'npwp'] as const) {
    const values = rows.map(row => ({ id: row.id, value: normalize(field, row[field]) }));
    const missing = values.filter(item => !item.value);
    if (missing.length) result.issues.push({ field, kind: 'missing', documentIds: missing.map(item => item.id) });
    const invalid = values.filter(item => item.value && (
      field === 'nib' ? !/^\d{13}$/.test(item.value)
        : field === 'npwp' ? !/^(?:\d{15}|\d{16})$/.test(item.value) : false
    ));
    if (invalid.length) result.issues.push({ field, kind: 'format', documentIds: invalid.map(item => item.id) });
    const valid = values.filter(item => item.value && !invalid.some(bad => bad.id === item.id));
    if (valid.length >= 2) {
      result.comparableFields++;
      if (new Set(valid.map(item => item.value)).size > 1) {
        result.issues.push({ field, kind: 'mismatch', documentIds: valid.map(item => item.id) });
      }
    }
  }
  return result;
}
