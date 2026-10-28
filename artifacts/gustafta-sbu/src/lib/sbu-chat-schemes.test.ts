import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SCHEMES, BG_SCHEMES, BS_SCHEMES, UNAVAILABLE_CLASSIFICATIONS, sameScheme, schemeActiveLabel, schemeFamilyOf, schemeForSend, schemeInfo, schemePrompts, schemesForFamily } from './sbu-chat-schemes';

test('pilot lists BG001..BG009 mapped to KBLI 41011..41019 (backward compatible)', () => {
  assert.deepEqual(BG_SCHEMES.map(s => s.id), ['BG001', 'BG002', 'BG003', 'BG004', 'BG005', 'BG006', 'BG007', 'BG008', 'BG009']);
  BG_SCHEMES.forEach((s, i) => { assert.equal(s.kbli, `4101${i + 1}`); assert.equal(s.family, 'BG'); });
});

const BS_EXPECTED: [string, string, string][] = [
  ['BS001', '42101', 'Konstruksi Jalan Pada Permukaan Tanah'],
  ['BS002', '42102', 'Konstruksi Bangunan Sipil Jembatan, Jalan Layang, Fly Over, dan Underpass'],
  ['BS003', '42103', 'Konstruksi Jalan Rel'],
  ['BS004', '42201', 'Konstruksi Jaringan Irigasi dan Drainase'],
  ['BS005', '42202', 'Konstruksi Bangunan Sipil Pengolahan Air Bersih'],
  ['BS006', '42203', 'Konstruksi Bangunan Sipil Sistem Pengolahan Limbah'],
  ['BS007', '42204', 'Konstruksi Bangunan Sipil Elektrikal'],
  ['BS008', '42205', 'Konstruksi Bangunan Sipil Telekomunikasi Untuk Prasarana Transportasi'],
  ['BS009', '42206', 'Konstruksi Sentral Telekomunikasi'],
  ['BS010', '42911', 'Konstruksi Bangunan Prasarana Sumber Daya Air'],
  ['BS011', '42912', 'Konstruksi Bangunan Pelabuhan Bukan Perikanan'],
  ['BS012', '42913', 'Konstruksi Bangunan Pelabuhan Perikanan'],
  ['BS013', '42991', 'Konstruksi Bangunan Sipil Minyak dan Gas Bumi'],
  ['BS014', '42992', 'Konstruksi Bangunan Sipil Pertambangan'],
  ['BS015', '42993', 'Konstruksi Bangunan Sipil Panas Bumi'],
  ['BS016', '42994', 'Konstruksi Bangunan Sipil Fasilitas Olahraga'],
  ['BS017', '42999', 'Konstruksi Bangunan Sipil Lainnya YTDL'],
  ['BS018', '42995', 'Konstruksi Bangunan Sipil Fasilitas Pengolahan'],
  ['BS019', '42996', 'Konstruksi Bangunan Sipil Fasilitas Militer dan Bandar Antariksa'],
  ['BS020', '42209', 'Konstruksi Proyek Utilitas Lainnya'],
];

test('BS001..BS020 use the exact non-sequential KBLI mapping and titles', () => {
  assert.equal(BS_SCHEMES.length, 20);
  assert.deepEqual(BS_SCHEMES.map(s => [s.id, s.kbli, s.title]), BS_EXPECTED);
  BS_SCHEMES.forEach(s => assert.equal(s.family, 'BS'));
});

test('combined lookup resolves both families, including non-sequential tail', () => {
  assert.equal(ALL_SCHEMES.length, 29);
  assert.equal(new Set(ALL_SCHEMES.map(s => s.id)).size, 29);
  assert.equal(schemeInfo('BG004')?.kbli, '41014');
  assert.equal(schemeInfo('BS017')?.kbli, '42999');
  assert.equal(schemeInfo('BS018')?.kbli, '42995');
  assert.equal(schemeInfo('BS019')?.kbli, '42996');
  assert.equal(schemeInfo('BS020')?.kbli, '42209');
  assert.equal(schemeInfo('BS020')?.title, 'Konstruksi Proyek Utilitas Lainnya');
  assert.equal(schemeFamilyOf('BS001'), 'BS');
  assert.equal(schemeFamilyOf('BG009'), 'BG');
  assert.equal(schemeInfo(undefined), undefined);
  assert.equal(schemeInfo('BS021'), undefined);
  assert.equal(schemeInfo('IN001'), undefined);
  assert.equal(schemesForFamily('BS'), BS_SCHEMES);
  assert.equal(schemesForFamily('BG'), BG_SCHEMES);
});

test('BS no longer listed as unavailable; other classifications remain', () => {
  assert.deepEqual(UNAVAILABLE_CLASSIFICATIONS.map(c => c.slice(0, 2)), ['IN', 'KK', 'KP', 'PA', 'PL', 'PB']);
});

test('scheme is never sent for document scope or pemeriksa_dokumen; cleared sends nothing', () => {
  assert.equal(schemeForSend('BG003', 'tutor_regulasi', false), 'BG003');
  assert.equal(schemeForSend('BS017', 'tutor_regulasi', false), 'BS017');
  assert.equal(schemeForSend('BS020', 'studi_kasus', false), 'BS020');
  assert.equal(schemeForSend('BG003', 'pemeriksa_dokumen', false), undefined);
  assert.equal(schemeForSend('BS019', 'pemeriksa_dokumen', false), undefined);
  assert.equal(schemeForSend('BS018', 'tutor_regulasi', true), undefined);
  assert.equal(schemeForSend(undefined, 'tutor_regulasi', false), undefined);
  assert.equal(schemeForSend('IN001' as never, 'tutor_regulasi', false), undefined);
});

test('reply scheme must match sent scheme exactly, including absence and family', () => {
  assert.equal(sameScheme(undefined, undefined), true);
  assert.equal(sameScheme(undefined, 'BG001'), false);
  assert.equal(sameScheme(undefined, 'BS001'), false);
  assert.equal(sameScheme('BG001', undefined), false);
  assert.equal(sameScheme('BG001', 'BG002'), false);
  assert.equal(sameScheme('BG001', 'BS001'), false);
  assert.equal(sameScheme('BS017', 'BS018'), false);
  assert.equal(sameScheme('BS020', 'BS020'), true);
  assert.equal(sameScheme(undefined, null), false);
});

test('active label and prompts are family-specific and do not compare unselected schemes', () => {
  assert.match(schemeActiveLabel(schemeInfo('BS002')!), /Bangunan Sipil/);
  assert.match(schemeActiveLabel(schemeInfo('BG002')!), /Bangunan Gedung/);
  for (const s of ALL_SCHEMES) {
    const ps = schemePrompts(s);
    assert.equal(ps.length, 3);
    for (const p of ps) {
      assert.match(p, new RegExp(`${s.id}|${s.kbli}`));
      const others = ALL_SCHEMES.filter(o => o.id !== s.id).map(o => o.id);
      for (const o of others) assert.ok(!p.includes(o), `${s.id} prompt mentions ${o}`);
      assert.doesNotMatch(p, /bandingkan|perbandingan/i);
    }
  }
});
