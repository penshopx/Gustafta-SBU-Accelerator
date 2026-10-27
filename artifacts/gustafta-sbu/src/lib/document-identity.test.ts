import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDocumentIdentities, type IdentityRow } from './document-identity';

const row = (id: string, patch: Partial<IdentityRow> = {}): IdentityRow => ({
  id, label: `Berkas ${id}`, companyName: 'PT Contoh Konstruksi',
  nib: '1234567890123', npwp: '123456789012345', ...patch,
});

test('matching manual identities normalize whitespace, case and NPWP punctuation only', () => {
  const result = compareDocumentIdentities([row('a'), row('b', {
    companyName: '  pt   contoh konstruksi ', nib: '12345 67890123', npwp: '12.345.678.9-012.345',
  })]);
  assert.deepEqual(result, { issues: [], comparableFields: 3, documentCount: 2 });
});

test('reports differing values without assuming which source is authoritative', () => {
  const result = compareDocumentIdentities([row('a'), row('b', {
    companyName: 'PT Berbeda', nib: '9994567890123', npwp: '1234567890123456',
  })]);
  assert.deepEqual(result.issues.map(issue => [issue.field, issue.kind, issue.documentIds]), [
    ['companyName', 'mismatch', ['a', 'b']], ['nib', 'mismatch', ['a', 'b']], ['npwp', 'mismatch', ['a', 'b']],
  ]);
});

test('blank or malformed inputs cannot yield an all-clear comparison', () => {
  const result = compareDocumentIdentities([
    row('a', { companyName: '', nib: '123', npwp: 'x' }),
    row('b', { companyName: ' ', nib: '', npwp: '' }),
  ]);
  assert.equal(result.comparableFields, 0);
  assert.equal(result.issues.length, 5);
  assert.ok(result.issues.some(issue => issue.kind === 'format' && issue.field === 'nib'));
});

test('does not silently remove name punctuation, NIB punctuation, letters or leading zeros', () => {
  const result = compareDocumentIdentities([row('a'), row('b', {
    companyName: 'PT. Contoh Konstruksi', nib: '12345-67890123', npwp: 'A123456789012345',
  })]);
  assert.deepEqual(result.issues.map(issue => [issue.field, issue.kind]), [
    ['companyName', 'mismatch'], ['nib', 'format'], ['npwp', 'format'],
  ]);
  assert.ok(compareDocumentIdentities([row('a'), row('b', { nib: '0234567890123' })])
    .issues.some(issue => issue.field === 'nib' && issue.kind === 'mismatch'));
});

test('keeps missing rows visible while comparing available values', () => {
  const result = compareDocumentIdentities([row('a'), row('b'), row('c', { nib: '' })]);
  assert.equal(result.comparableFields, 3);
  assert.deepEqual(result.issues, [{ field: 'nib', kind: 'missing', documentIds: ['c'] }]);
});

test('requires bounded unique document rows', () => {
  assert.throws(() => compareDocumentIdentities([row('a')]), RangeError);
  assert.throws(() => compareDocumentIdentities(Array.from({ length: 9 }, (_, i) => row(String(i)))), RangeError);
  assert.throws(() => compareDocumentIdentities([row('a'), row('a')]), /unik/);
});
