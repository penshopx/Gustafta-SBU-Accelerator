import { compareDocumentIdentities, type IdentityRow } from './document-identity';

/** Creates manual follow-ups without copying identity field values. */
export function identityActionTitles(rows: IdentityRow[]): string[] {
  const labels = { companyName: 'nama badan usaha', nib: 'NIB', npwp: 'NPWP' };
  const verbs = { missing: 'Lengkapi', format: 'Periksa format', mismatch: 'Tinjau perbedaan' };
  return compareDocumentIdentities(rows).issues.flatMap(issue => issue.documentIds.map(id => {
    const index = rows.findIndex(row => row.id === id);
    const label = rows[index].label.replace(/[\r\n\t\u2028\u2029]/gu, ' ').trim().slice(0, 80);
    return `${verbs[issue.kind]} ${labels[issue.field]} — Berkas ${index + 1}${label ? ` (${label})` : ''}`;
  }));
}
