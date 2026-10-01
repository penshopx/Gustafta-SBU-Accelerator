import assert from "node:assert/strict";
import test from "node:test";
import { assessCase, REGULATIONS, regulationsFor } from "../src/lib/sbu-rules.ts";

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

function verified(track, overrides = {}) {
  return {
    track,
    publisher: "Ditjen Bina Konstruksi",
    sourceUrl: "https://pu.go.id/surat/contoh",
    documentNumber: `Surat ${track}`,
    signatory: "Direktur Jenderal",
    issuedOn: "2026-03-31",
    scope: "Pemberlakuan dan cakupan SBU",
    documentStatus: "berlaku",
    sourceVerified: true,
    expertName: "Penelaah Skema",
    expertOrganization: "LSBU Teridentifikasi",
    expertReview: "Persyaratan untuk alur telah ditelaah.",
    expertReviewedOn: "2026-04-01",
    expertApproved: true,
    verifiedBy: "reviewer-id",
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

test("regulasi statis dan dinamis membatasi tiap temuan transisi pada dasar hukumnya", () => {
  assert.equal(REGULATIONS.length, 2);
  for (const regulation of REGULATIONS) {
    assert.equal(regulation.effectiveStatus, "unverified");
    assert.ok(Array.isArray(regulation.transitionFindings));
    assert.ok(regulation.transitionFindings.every((finding) =>
      finding.status === "perlu_tinjauan" && !("transitionDate" in finding)));
  }

  const regulations = regulationsFor([
    verified("transisi"),
    verified("transisi_operasional"),
  ]);
  const kepdirjen = regulations.find((item) => item.id === "kepdirjen-281-2026");
  const permen = regulations.find((item) => item.id === "permen-6-2025");
  assert.deepEqual(kepdirjen.transitionFindings.map((finding) => finding.code), ["transisi"]);
  assert.deepEqual(permen.transitionFindings.map((finding) => finding.code),
    ["transisi_operasional", "transisi_konversi"]);
  assert.equal(kepdirjen.effectiveStatus, "verified");
  assert.equal(permen.effectiveStatus, "partial");
  assert.equal(kepdirjen.transitionFindings[0].transitionDate, "2026-09-30");
});

test("status regulasi hanya naik untuk rekaman resmi dan telaah ahli lengkap yang masih berlaku", () => {
  const valid = verified("transisi");
  const invalidRecords = [
    verified("transisi", { documentStatus: "dicabut" }),
    verified("transisi", { expertApproved: false }),
    verified("transisi", { sourceVerified: false }),
    verified("transisi", { verifiedBy: "" }),
    verified("transisi", { expertReview: "" }),
  ];
  for (const record of invalidRecords) {
    const [kepdirjen] = regulationsFor([record]).filter((item) => item.id === "kepdirjen-281-2026");
    assert.equal(kepdirjen.effectiveStatus, "unverified");
    assert.equal(kepdirjen.transitionFindings[0].status, "perlu_tinjauan");
    assert.equal("transitionDate" in kepdirjen.transitionFindings[0], false);
  }

  const [kepdirjen] = regulationsFor([valid]).filter((item) => item.id === "kepdirjen-281-2026");
  assert.equal(kepdirjen.effectiveStatus, "verified");
  assert.equal(kepdirjen.transitionFindings[0].transitionDate, "2026-09-30");
});

test("tanggal regulasi sama persis dengan temuan penilaian dan tidak berasal dari tanggal pemohon", () => {
  const records = [
    verified("transisi", { issuedOn: "2026-03-31" }),
    verified("transisi_operasional", { issuedOn: "2026-04-30" }),
    verified("transisi_konversi", { issuedOn: "2026-04-30" }),
  ];
  const regulations = regulationsFor(records);
  const assessment = assessCase(caseWithDates, evidence, records);
  for (const regulation of regulations) {
    for (const finding of regulation.transitionFindings) {
      assert.deepEqual(finding, assessment.findings.find((item) => item.code === finding.code));
    }
  }
  assert.deepEqual(regulations.map((item) => item.effectiveStatus), ["verified", "verified"]);
  assert.equal(regulations[0].transitionFindings[0].transitionDate, "2026-04-30");
  assert.equal(regulations[0].transitionFindings[0].transitionDate, "2026-04-30");
  assert.equal(regulations[0].transitionFindings[1].transitionDate, "2026-10-30");
  assert.equal(regulations[1].transitionFindings[0].transitionDate, "2026-09-30");
  assert.doesNotMatch(JSON.stringify(regulations), /2027-04-15/);
});