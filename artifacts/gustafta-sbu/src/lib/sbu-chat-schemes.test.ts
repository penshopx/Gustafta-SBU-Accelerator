import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BG_SCHEMES, sameScheme, schemeForSend, schemePrompts } from './sbu-chat-schemes';

test('pilot lists BG001..BG009 mapped to KBLI 41011..41019', () => {
  assert.deepEqual(BG_SCHEMES.map(s => s.id), ['BG001', 'BG002', 'BG003', 'BG004', 'BG005', 'BG006', 'BG007', 'BG008', 'BG009']);
  BG_SCHEMES.forEach((s, i) => assert.equal(s.kbli, `4101${i + 1}`));
});

test('scheme is never sent for document scope or pemeriksa_dokumen', () => {
  assert.equal(schemeForSend('BG003', 'tutor_regulasi', false), 'BG003');
  assert.equal(schemeForSend('BG003', 'pemeriksa_dokumen', false), undefined);
  assert.equal(schemeForSend('BG003', 'tutor_regulasi', true), undefined);
  assert.equal(schemeForSend(undefined, 'tutor_regulasi', false), undefined);
  assert.equal(schemeForSend('BS001' as never, 'tutor_regulasi', false), undefined);
});

test('reply scheme must match sent scheme exactly, including absence', () => {
  assert.equal(sameScheme(undefined, undefined), true);
  assert.equal(sameScheme(undefined, 'BG001'), false);
  assert.equal(sameScheme('BG001', undefined), false);
  assert.equal(sameScheme('BG001', 'BG002'), false);
  assert.equal(sameScheme('BG001', 'BG001'), true);
  assert.equal(sameScheme(undefined, null), false);
});

test('starter prompts reference the active scheme and KBLI', () => {
  for (const p of schemePrompts(BG_SCHEMES[4])) assert.match(p, /BG005|41015/);
});
