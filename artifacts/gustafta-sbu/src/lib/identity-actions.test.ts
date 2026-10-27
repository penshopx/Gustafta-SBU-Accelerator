import test from 'node:test';
import assert from 'node:assert/strict';
import { identityActionTitles } from './identity-actions';
import type { IdentityRow } from './document-identity';
const row = (id: string, patch: Partial<IdentityRow> = {}): IdentityRow => ({ id, label: '', companyName: 'PT CONTOH', nib: '1234567890123', npwp: '123456789012345', ...patch });

test('matching rows generate no actions', () => {
  assert.deepEqual(identityActionTitles([row('a'), row('b')]), []);
});
test('each affected document receives a follow-up without identity values', () => {
  const actions = identityActionTitles([row('a', { label: 'Akta\nlama' }), row('b', { companyName: 'PT LAIN', nib: '', npwp: 'x' })]);
  assert.equal(actions.length, 4);
  assert.match(actions[0], /Tinjau perbedaan nama badan usaha — Berkas 1 \(Akta lama\)/);
  assert.match(actions[2], /Lengkapi NIB — Berkas 2/);
  assert.match(actions[3], /Periksa format NPWP/);
  assert.doesNotMatch(actions.join('\n'), /PT CONTOH|PT LAIN|1234567890123/);
});
