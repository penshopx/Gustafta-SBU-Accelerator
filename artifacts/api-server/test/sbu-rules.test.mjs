import assert from "node:assert/strict";
import test from "node:test";
import { assessCase, REGULATIONS } from "../src/lib/sbu-rules.ts";

const caseWithDates = {
  id: 12,
  ownerId: "test-user",
  companyName: "Contoh BUJK",
  requestType: "perpanjangan",
  qualification: "kecil",
  classification: "contoh",
  status: "draf",
  existingSbuExpiresOn: "2027-04-15",
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-09-26T00:00:00Z"),
};

const evidence = [
  {
    id: 1,
    caseId: 12,
    code: "legalitas",
    title: "Legalitas",
    note: "Kepdirjen ditetapkan 2026-03-01; surat Pasal 20 ayat (2) belum diverifikasi",
    updatedAt: new Date("2026-09-26T00:00:00Z"),
  },
];

test("konversi SBU tetap belum terverifikasi tanpa surat Pasal 20 ayat (2), meski ada tanggal lain", () => {
  const assessment = assessCase(caseWithDates, evidence);
  const lsbu = assessment.findings.find((item) => item.code === "transisi");
  const operational = assessment.findings.find((item) => item.code === "transisi_operasional");
  const transition = assessment.findings.find((item) => item.code === "transisi_konversi");

  assert.ok(lsbu && operational && transition, "perpanjangan harus memuat keputusan masing-masing alur");
  assert.equal(transition.status, "perlu_tinjauan");
  assert.match(transition.detail, /Konversi SBU eksisting memakai 6 bulan sejak terbitnya surat Pasal 20 ayat \(2\), bukan tanggal Kepdirjen/);
  assert.match(transition.detail, /surat Pasal 20 ayat \(2\).*belum terkonfirmasi/);
  assert.match(lsbu.detail, /6 bulan sejak penetapan/);
  assert.match(operational.detail, /kesiapan SIJK/);
  assert.equal(assessment.status, "perlu_bukti");
  assert.equal("conversionDeadline" in assessment, false);
  assert.equal("deadline" in transition, false);
  assert.doesNotMatch(JSON.stringify(assessment), /\b20\d{2}-\d{2}-\d{2}\b|"(?:\w*deadline|\w*countdown|\w*dueDate)"/i);
});

test("tidak ada tenggat konversi atau hitung mundur untuk jenis permohonan lain", () => {
  const assessment = assessCase({ ...caseWithDates, requestType: "baru" }, evidence);
  assert.equal(assessment.findings.some((item) => item.code.startsWith("transisi")), false);
  assert.equal("conversionDeadline" in assessment, false);
  assert.doesNotMatch(JSON.stringify(assessment), /\b20\d{2}-\d{2}-\d{2}\b|"(?:\w*deadline|\w*countdown|\w*dueDate)"/i);
});

test("status regulasi tidak berubah menjadi tanggal dari Kepdirjen", () => {
  assert.equal(REGULATIONS.length, 2);
  for (const regulation of REGULATIONS) {
    assert.equal(regulation.effectiveStatus, "Tenggat belum terverifikasi");
    assert.doesNotMatch(JSON.stringify(regulation), /\b20\d{2}-\d{2}-\d{2}\b/);
  }
});