import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SbuChatCitation } from '@workspace/api-client-react';
import { ChatCitations, chatAnswerForCopy } from './chat-citations';

const source: SbuChatCitation = {
  id: 'pu6-metadata', document: 'Permen PU Nomor 6 Tahun 2025', version: '6/2025',
  locator: 'Metadata JDIH — status', excerpt: 'Metadata mencantumkan Berlaku.',
  verificationStatus: 'verified', verificationScope: 'Metadata penerbit saja.',
  documentStatus: 'Berlaku pada pemeriksaan; bukan konfirmasi terkini.',
  sourceUrl: 'https://jdih.pu.go.id/', checkedOn: '2026-09-26',
  limitation: 'Bukan pengesahan seluruh aturan.',
};
test('source cards distinguish limited verification, show locator and retain limits when copied', () => {
  const sources = [source, { ...source, id: 'pu6-smap', locator: 'Lampiran I PDF hlm. 266',
    verificationStatus: 'unverified' as const, verificationScope: 'Ringkasan salinan.' }];
  const html = renderToStaticMarkup(<ChatCitations citations={sources} notice="Bukan verifikasi live." />);
  for (const text of ['Terverifikasi terbatas', 'Belum terverifikasi', 'hlm. 266', 'Bukan verifikasi live.',
    'Bukan pengesahan seluruh aturan.', '2026-09-26', 'bukan kutipan verbatim']) assert.ok(html.includes(text));
  assert.match(html, /href="https:\/\/jdih.pu.go.id\/".*rel="noopener noreferrer"/);
  const copy = chatAnswerForCopy('Jawaban [pu6-metadata]', sources, 'Bukan verifikasi live.');
  for (const text of ['[pu6-metadata]', 'hlm. 266', 'Belum terverifikasi', source.limitation, source.sourceUrl]) assert.ok(copy.includes(text));
});
test('no citations is explicit and never styled as verified', () => {
  const html = renderToStaticMarkup(<ChatCitations citations={[]} notice="Pencarian lokal." />);
  assert.match(html, /Tidak ada kutipan sumber.*belum terverifikasi/);
  assert.doesNotMatch(html, /Terverifikasi terbatas|<a /);
});
