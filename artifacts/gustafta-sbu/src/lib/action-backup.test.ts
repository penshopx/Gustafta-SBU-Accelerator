import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_BACKUP_BYTES, parseActionBackup, serializeActionBackup } from './action-backup';
import type { ActionItem } from './sbu-mini-apps';
const row: ActionItem = { id: 'local-id', title: 'Telaah SKK 工程', responsible: 'Tim teknik', dueOn: '2028-02-29', status: 'done' };
const wrap = (actions: unknown, patch = {}) => JSON.stringify({ format: 'gustafta-sbu-actions', version: 1, actions, ...patch });
test('backup round trip preserves user fields and excludes local IDs', () => {
  const text = serializeActionBackup([row]);
  assert.ok(!text.includes('local-id'));
  const { id: _, ...expected } = row;
  assert.deepEqual(parseActionBackup(text), [expected]);
});
test('rejects malformed envelopes, versions, fields, dates and unknown keys', () => {
  for (const text of ['{', 'null', '[]', wrap([], { version: 2 }), wrap({}, {}), wrap([], { extra: true })]) assert.throws(() => parseActionBackup(text));
  const { id: _, ...entry } = row;
  for (const patch of [{ title: '' }, { title: 'a'.repeat(201) }, { responsible: 3 }, { responsible: 'a'.repeat(121) }, { dueOn: '2026-02-29' }, { status: 'verified' }, { id: 'spoofed' }, { __proto__: null, extra: 'unexpected' }]) {
    assert.throws(() => parseActionBackup(wrap([{ ...entry, ...patch }])));
  }
});
test('enforces size and action count and permits empty optional values', () => {
  assert.throws(() => parseActionBackup(' '.repeat(MAX_BACKUP_BYTES + 1)));
  const { id: _, ...entry } = row;
  assert.throws(() => parseActionBackup(wrap(Array(201).fill(entry))));
  assert.equal(parseActionBackup(wrap([{ ...entry, responsible: '', dueOn: '' }]))[0].dueOn, '');
  assert.deepEqual(parseActionBackup(wrap([])), []);
});
