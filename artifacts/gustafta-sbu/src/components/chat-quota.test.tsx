import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatQuotaNotice, chatLimitMessage, chatQuotaFromError } from './chat-quota';

const quota = {
  userId: 'owner-a', dailyLimit: 30, dailyRemaining: 12, minuteLimit: 6, minuteRemaining: 4,
  dailyResetAt: '2026-10-19T00:00:00.000Z', minuteResetAt: '2026-10-18T12:01:00.000Z',
  busy: false, retryAfterSeconds: 0,
};

test('quota notice shows remaining counts, WIB reset and failed-attempt policy', () => {
  const html = renderToStaticMarkup(<ChatQuotaNotice quota={quota} />);
  assert.match(html, /12 dari 30/);
  assert.match(html, /4 dari 6/);
  assert.match(html, /07.00 WIB/);
  assert.match(html, /19\/10\/2026/);
  assert.match(html, /tetap dihitung saat gagal/);
  assert.match(html, /semua tab, mode, dan spesialis/);
  assert.match(html, /role="status"/);
});

test('limit errors distinguish daily, minute and concurrent requests without echoing raw errors', () => {
  const failure = (code: string) => ({ status: 429, data: { code, error: 'secret provider text' } });
  assert.match(chatLimitMessage(failure('chat_daily_limit'))!, /Kuota harian habis.*07.00 WIB/);
  assert.match(chatLimitMessage(failure('chat_minute_limit'))!, /menit berganti/);
  assert.match(chatLimitMessage(failure('chat_busy'))!, /tab lain/);
  assert.doesNotMatch(chatLimitMessage(failure('unknown'))!, /secret/);
  assert.equal(chatLimitMessage({ status: 503 }), undefined);
});

test('error quota is only accepted for the mounted account and valid counters/dates', () => {
  assert.deepEqual(chatQuotaFromError({ data: { quota } }, 'owner-a'), quota);
  assert.equal(chatQuotaFromError({ data: { quota } }, 'owner-b'), undefined);
  assert.equal(chatQuotaFromError({ data: { quota: { ...quota, dailyRemaining: -1 } } }, 'owner-a'), undefined);
  assert.equal(chatQuotaFromError({ data: { quota: { ...quota, dailyResetAt: 'broken' } } }, 'owner-a'), undefined);
});
