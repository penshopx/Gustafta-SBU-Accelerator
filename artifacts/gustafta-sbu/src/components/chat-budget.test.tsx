import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatBudgetNotice, chatBudgetForOwner } from './chat-budget';
import type { SbuChatBudget } from '@workspace/api-client-react';

const budget: SbuChatBudget = {
  userId: 'owner-a', status: 'available', checkedAt: '2026-10-26T00:00:00.000Z', nextResetAt: null,
};
const render = (data?: SbuChatBudget, pending = false) => renderToStaticMarkup(
  <ChatBudgetNotice budget={data} pending={pending} checking={pending} onRefresh={() => {}} />,
);
test('budget notice distinguishes availability, shared exhaustion, unknown and loading without promising certification or spend', () => {
  assert.match(render(budget), /cukup untuk satu reservasi/);
  const blocked = render({ ...budget, status: 'exhausted', nextResetAt: '2026-11-01T00:00:00.000Z' });
  assert.match(blocked, /meskipun kuota akun Anda masih tersisa/);
  assert.match(blocked, /1 Nov 2026/);
  assert.match(blocked, /07.00 WIB/);
  assert.match(blocked, /Kuota akun dan anggaran operasional adalah dua batas berbeda/);
  assert.match(blocked, /tidak memakai kuota atau memanggil AI/);
  assert.match(blocked, /role="status"/);
  assert.match(render({ ...budget, status: 'exhausted' }), /peninjauan pengelola/);
  assert.match(render({ ...budget, status: 'unavailable' }), /belum dapat diverifikasi/);
  assert.match(render(undefined), /draf Anda tetap tersimpan/);
  assert.match(render(undefined, true), /Memeriksa ketersediaan/);
  assert.doesNotMatch(blocked, /\$|reservedMicros|fingerprint/);
});
test('availability from another account or malformed responses cannot enable sending', () => {
  assert.equal(chatBudgetForOwner(budget, 'owner-a'), budget);
  assert.equal(chatBudgetForOwner(budget, 'owner-b'), undefined);
  assert.equal(chatBudgetForOwner({ ...budget, status: 'bogus' } as unknown as SbuChatBudget, 'owner-a'), undefined);
  assert.equal(chatBudgetForOwner({ ...budget, checkedAt: '' }, 'owner-a'), undefined);
  assert.equal(chatBudgetForOwner({ ...budget, nextResetAt: 'broken' }, 'owner-a'), undefined);
});
