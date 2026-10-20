import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiBudgetErrorMessage } from './ai-budget-error';

test('budget refusal differs from account quota and provider failure without echoing private payloads', () => {
  const failure = (code: string) => ({ status: 503, data: { code, error: 'SECRET chat or provider contents' } });
  for (const code of ['ai_budget_exhausted', 'ai_budget_unavailable']) {
    const message = aiBudgetErrorMessage(failure(code))!;
    assert.match(message, /anggaran operasional AI/i);
    assert.match(message, /tidak dikirim ke AI/);
    assert.match(message, /Draf dipertahankan/);
    assert.doesNotMatch(message, /SECRET|provider contents|sudah dikirim/);
  }
  assert.match(aiBudgetErrorMessage(failure('ai_budget_exhausted'))!, /bersama tercapai/);
  assert.match(aiBudgetErrorMessage(failure('ai_budget_unavailable'))!, /belum dapat diverifikasi/);
  for (const error of [null, undefined, {}, { status: 503 }, failure('unknown'),
    { status: 429, data: { code: 'ai_budget_exhausted' } }]) {
    assert.equal(aiBudgetErrorMessage(error), undefined);
  }
});
