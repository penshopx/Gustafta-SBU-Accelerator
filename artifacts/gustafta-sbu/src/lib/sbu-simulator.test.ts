import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulatorDraft, evaluateSimulator, simulatorProfileErrors, simulatorReportText, validSimulatorDate, SIMULATOR_AREAS } from './sbu-simulator';

function filled() {
  const draft = createSimulatorDraft();
  Object.assign(draft, { companyName: 'PT Contoh Simulasi', subclassification: 'BG001', qualification: 'K1', firstSbu: 'ya' });
  for (const area of SIMULATOR_AREAS) {
    draft.documents[area.id] = { status: 'tersedia', reference: `CONTOH-${area.id}`, companyName: 'PT Contoh Simulasi', note: '' };
  }
  draft.contractReference = 'Kontrak latihan';
  draft.allocation = 'Porsi simulasi untuk ditelaah; bukan nilai kelayakan.';
  draft.reusedExperience = 'tidak';
  return draft;
}
test('draf baru independen dan tidak memiliki data pengguna atau hasil siap', () => {
  const a = createSimulatorDraft();
  const b = createSimulatorDraft();
  a.documents.legalitas.reference = 'Tidak boleh bocor';
  assert.equal(b.documents.legalitas.reference, '');
  assert.equal(evaluateSimulator(b).coverage, 0);
  assert.equal(simulatorProfileErrors(b).length, 3);
});
test('baru tidak menghitung SBU lama, perpanjangan wajib nomor dan tanggal', () => {
  const draft = filled();
  assert.equal(evaluateSimulator(draft).totalAreas, 6);
  draft.requestType = 'perpanjangan';
  assert.equal(evaluateSimulator(draft).totalAreas, 7);
  assert.equal(simulatorProfileErrors(draft).length, 2);
  draft.existingNumber = 'CONTOH-SBU';
  draft.existingExpiresOn = '2028-02-29';
  assert.deepEqual(simulatorProfileErrors(draft), []);
});
test('tanggal kalender tidak menerima normalisasi tanggal rusak atau timestamp', () => {
  for (const value of ['', '2027-02-29', '2028-02-30', '2026-13-01', '2026-01-01T00:00:00Z']) {
    assert.equal(validSimulatorDate(value), false, value);
  }
  assert.equal(validSimulatorDate('2028-02-29'), true);
});
test('100% area ditandai tetap perlu tinjauan, bukan lulus atau pengesahan BG001', () => {
  const draft = filled();
  const before = JSON.stringify(draft);
  const result = evaluateSimulator(draft);
  assert.equal(result.coverage, 100);
  assert.match(result.status, /perlu tinjauan manusia/);
  assert.ok(result.findings.some(item => item.id === 'cakupan-aturan'));
  assert.equal(JSON.stringify(draft), before, 'evaluasi tidak mengubah input atau kasus');
});
test('nama berbeda ditemukan tetapi kapitalisasi dan spasi tidak menjadi konflik', () => {
  const draft = filled();
  draft.documents.legalitas.companyName = ' pt   contoh simulasi ';
  assert.equal(evaluateSimulator(draft).conflicts, 0);
  draft.documents.legalitas.companyName = 'PT Berbeda';
  assert.ok(evaluateSimulator(draft).findings.some(item => item.id === 'legalitas-nama'));
});
test('tersedia tanpa referensi dan pengecualian tanpa alasan bukan bukti lengkap', () => {
  const draft = filled();
  draft.documents.keuangan.reference = '';
  draft.documents.peralatan.status = 'tidak_relevan';
  assert.equal(evaluateSimulator(draft).missing, 2);
  draft.documents.peralatan.note = 'Membutuhkan konfirmasi penelaah.';
  const finding = evaluateSimulator(draft).findings.find(item => item.id === 'peralatan')!;
  assert.equal(finding.severity, 'review');
  assert.match(finding.action, /bukan pembebasan/);
});
test('permohonan baru bukan otomatis SBU pertama dan pengalaman ulang bukan penolakan otomatis', () => {
  const draft = filled();
  draft.firstSbu = 'belum_diketahui';
  draft.reusedExperience = 'ya';
  draft.allocation = '';
  const result = evaluateSimulator(draft);
  for (const id of ['pertama', 'penggunaan-ulang', 'alokasi']) {
    assert.equal(result.findings.find(item => item.id === id)?.severity, 'review');
  }
  assert.equal(result.conflicts, 0);
});
test('perubahan isian menghitung hasil baru dan laporan mempertahankan batas pemeriksaan', () => {
  const draft = filled();
  assert.equal(evaluateSimulator(draft).missing, 0);
  draft.documents.personel.status = 'belum_tersedia';
  assert.equal(evaluateSimulator(draft).missing, 1);
  const text = simulatorReportText(draft);
  assert.match(text, /Personel/);
  assert.match(text, /belum_tersedia/);
  assert.match(text, /bukan verifikasi berkas asli/);
  assert.match(text, /Bukan skor kelayakan/);
  assert.match(text, /Tidak ada data yang diunggah/);
});
