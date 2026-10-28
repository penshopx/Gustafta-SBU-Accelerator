import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServiceRequestMessage, buildWhatsAppUrl, emptyServiceRequest, normalizeIndonesianMobile, validateServiceRequest, type ServiceRequestDraft } from './service-request.ts';

const ok = (): ServiceRequestDraft => ({ ...emptyServiceRequest(), name: '  Rina  ', company: 'CV Tirta Bangun', phone: '0812-3456-7890', location: 'Bekasi, Jawa Barat', applicationType: 'baru', help: ['skk', 'pengalaman'] });

test('phone normalization', () => {
  for (const v of ['0812-3456-7890', '+62 812 3456 7890', '6281234567890', '(0812) 3456.7890']) assert.equal(normalizeIndonesianMobile(v), '6281234567890', v);
  for (const v of ['0812abc34567', '021-555-1234', '+1 812 3456 7890', '08123', '', '0812345678901234567']) assert.equal(normalizeIndonesianMobile(v), null, v);
});

test('validation: required, bounds, consent', () => {
  assert.deepEqual(validateServiceRequest(ok(), true), {});
  const e = validateServiceRequest({ ...emptyServiceRequest(), name: '   ' }, false);
  for (const k of ['name', 'company', 'phone', 'location', 'applicationType', 'help', 'consent']) assert.ok(e[k as keyof typeof e], k);
  const long = validateServiceRequest({ ...ok(), name: 'a'.repeat(101), company: 'b'.repeat(161), location: 'c'.repeat(121), classification: 'd'.repeat(161), notes: 'e'.repeat(1001) }, true);
  for (const k of ['name', 'company', 'location', 'classification', 'notes']) assert.ok(long[k as keyof typeof long], k);
  assert.ok(validateServiceRequest({ ...ok(), help: ['nope' as never] }, true).help);
});

test('message and URL encoding', () => {
  const msg = buildServiceRequestMessage({ ...ok(), notes: 'A & B #1 <x> ?=' });
  assert.match(msg, /Nama kontak: Rina\n/); assert.match(msg, /WhatsApp: \+6281234567890/); assert.match(msg, /- SKK & personel/);
  assert.match(msg, /bukan pengajuan resmi/);
  const url = new URL(buildWhatsAppUrl(msg));
  assert.equal(url.origin + url.pathname, 'https://wa.me/6281287941900');
  assert.equal(url.searchParams.get('text'), msg);
  assert.doesNotMatch(url.search, /[#<> ]/);
});

test('application types and service choices reflect SBU preparation scope', () => {
  for (const applicationType of ['baru', 'perpanjangan', 'belum-yakin'] as const) {
    assert.deepEqual(validateServiceRequest({ ...ok(), applicationType, help: ['pub-lkut', 'smap'] }, true), {});
  }
  const msg = buildServiceRequestMessage({ ...ok(), help: ['pub-lkut', 'smap'] });
  assert.match(msg, /PUB \/ LKUT/);
  assert.match(msg, /SMAP \/ Pancek/);
});
