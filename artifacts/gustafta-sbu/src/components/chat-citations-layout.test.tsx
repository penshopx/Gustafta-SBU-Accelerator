import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatCitations } from './chat-citations';
import type { SbuChatCitation } from '@workspace/api-client-react';

test('long version hashes and citation identifiers remain intact with anywhere wrapping', () => {
  const source: SbuChatCitation = {
    id: 'bg002-scope@kbli2025-bg-scope-20261028-r1',
    document: 'Sumber sintetis', version: `SHA-256 ${'a'.repeat(64)}`,
    locator: 'PDF hlm. 573, cetak 557', excerpt: 'Ringkasan sintetis.',
    sourceUrl: 'https://example.com/', verificationStatus: 'unverified',
    checkedOn: '2026-10-28', verificationScope: 'Pengujian tampilan.',
    documentStatus: 'Contoh', limitation: 'Bukan ketentuan sertifikasi.',
  };
  const html = renderToStaticMarkup(<ChatCitations citations={[source]} notice="Contoh" />);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.ok(html.includes(source.id));
  assert.ok(html.includes('a'.repeat(64)), 'do not truncate provenance to hide overflow');
  assert.match(html, /min-w-0 max-w-full/);
});
