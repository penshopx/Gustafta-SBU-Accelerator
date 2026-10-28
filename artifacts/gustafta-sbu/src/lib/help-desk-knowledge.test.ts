import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_QUICK_QUESTIONS, resolveHelpQuestion } from './help-desk-knowledge';

test('natural Indonesian questions resolve to the right workflow without private data', () => {
  for (const [q, id] of [
    ['BAGAIMANA CARA UPLOAD DOKUMEN?', 'vault'],
    ['bagaimana membuat kasus SBU?', 'case'],
    ['bagaimana menjalankan Bedah Dokumen?', 'analysis'],
    ['bagaimana berdialog tentang dokumen saya?', 'document-chat'],
    ['Bagaimana menggunakan Asisten AI?', 'assistant'],
    ['Bagaimana memakai Pakar Skema BG dan BS?', 'scheme'],
    ['Bagaimana mengisi checklist SMAP?', 'smap'],
    ['Bagaimana menggunakan agenda kasus?', 'agenda'],
    ['Bagaimana unduh ringkasan persiapan?', 'export'],
    ['Bagaimana mulai menggunakan aplikasi?', 'start'],
    ['Mengapa simpan atau chat gagal?', 'troubleshooting'],
    ['Apa beda Admin dan User?', 'permissions'],
    ['Bagaimana mengubah profil?', 'profile'],
  ]) assert.equal(resolveHelpQuestion(q).topic, id, q);
});

test('all quick and related suggestions lead to a documented topic, with constant safe routes', () => {
  const pending = [...HELP_QUICK_QUESTIONS, 'privasi', 'personel', 'konsultasi', 'simulator', 'pusat regulasi'];
  const seen = new Set<string>();
  const routes = new Set(['/sign-in', '/sign-up', '/settings', '/company-profile', '/cases', '/documents',
    '/assistant', '/regulations', '/personnel', '/agenda', '/consultations', '/dashboard', '/mini-apps', '/simulator']);
  for (let i = 0; i < pending.length; i++) {
    const answer = resolveHelpQuestion(pending[i]);
    assert.equal(answer.matched, true, pending[i]);
    assert.ok(answer.steps.length > 0 && answer.source);
    for (const link of answer.links) assert.ok(routes.has(link.path), link.path);
    if (!seen.has(answer.topic)) { seen.add(answer.topic); pending.push(...answer.related); }
  }
  assert.ok(seen.size >= 18);
});

test('context follow-up is bounded, and arbitrary unknown questions never reuse the last answer', () => {
  assert.equal(resolveHelpQuestion('Lalu?', 'vault').topic, 'vault');
  assert.equal(resolveHelpQuestion('langkah selanjutnya', 'analysis').topic, 'analysis');
  assert.equal(resolveHelpQuestion('cuaca besok', 'vault').matched, false);
  assert.equal(resolveHelpQuestion('lanjut', 'invalid').matched, false);
  assert.equal(resolveHelpQuestion('').matched, false);
  assert.equal(resolveHelpQuestion('pengakuan').matched, false, 'whole words, not substring akun');
});

test('legal questions get a scope boundary, never requirements or a verdict', () => {
  for (const question of ['Berapa modal untuk BG001?', 'Apakah pasti lolos?', 'syarat SKK BS018',
    'berapa alat yang dibutuhkan?', 'Bagaimana memeriksa keaslian sertifikat?']) {
    const answer = resolveHelpQuestion(question);
    assert.equal(answer.topic, 'out-of-scope');
    assert.match(answer.summary, /bukan penentu/);
    assert.ok(answer.links.some(link => link.path === '/assistant'));
  }
});

test('answers are independent copies; question text cannot become HTML, source or an external link', () => {
  const a = resolveHelpQuestion('upload dokumen');
  a.links[0].path = 'https://evil.invalid'; a.steps[0] = 'changed'; a.related.push('changed');
  const b = resolveHelpQuestion('upload dokumen');
  assert.equal(b.links[0].path, '/documents'); assert.notEqual(b.steps[0], 'changed');
  assert.equal(b.related.includes('changed'), false);
  const injected = resolveHelpQuestion('<script>alert("x")</script> https://evil.invalid');
  assert.equal(injected.matched, false); assert.doesNotMatch(JSON.stringify(injected), /evil|<script>/);
});
