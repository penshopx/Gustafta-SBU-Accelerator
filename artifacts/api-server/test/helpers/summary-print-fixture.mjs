import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// One fixture for Chromium, Firefox and manually exported Safari PDFs.
export async function summaryPrintFixture(directory) {
  const bundle = join(directory, "summary.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../../src/lib/preparation-summary.ts", import.meta.url))],
    outfile: bundle, bundle: true, platform: "node", format: "esm",
  });
  const { preparationSummary, SUMMARY_DISCLAIMER } = await import(pathToFileURL(bundle).href);
  const generatedAt = new Date("2026-01-15T12:00:00Z");
  const item = {
    id: 1, ownerId: "synthetic-not-a-real-account", companyName: "Usaha Fixture Cetak",
    requestType: "perpanjangan", qualification: "kecil", classification: "gedung",
    status: "draf", existingSbuExpiresOn: "2028-01-01", createdAt: generatedAt, updatedAt: generatedAt,
  };
  const codes = [
    "legalitas", "penjualan", "keuangan", "tenaga", "peralatan", "smap_commitment",
    ...Array.from({ length: 180 }, (_, i) => `kategori-fixture-${String(i).padStart(3, "0")}`),
  ];
  const evidence = codes.map((code, i) => ({
    id: i + 1, caseId: item.id, code,
    title: "PRIVATE_FIXTURE_TITLE", note: "PRIVATE_FIXTURE_NOTE", updatedAt: generatedAt,
  }));
  const personnel = [{
    id: "00000000-0000-4000-8000-000000000001", caseId: item.id, fullName: "Personel Fixture Cetak",
    assignment: "pjt", position: "Manajer", notes: "PRIVATE_FIXTURE_PERSONNEL_NOTE", revision: 0,
    asOfDate: "2026-01-15", createdAt: generatedAt.toISOString(), updatedAt: generatedAt.toISOString(),
    certificates: Array.from({ length: 12 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`,
      personnelId: "00000000-0000-4000-8000-000000000001",
      certificateNumber: `SKK-FIXTURE-${String(i).padStart(2, "0")}`,
      issuer: "Penerbit Fixture", jobTitle: "Jabatan Fixture", level: 6,
      issuedOn: "2025-01-01", expiresOn: "2026-01-31", dateStatus: "expiring", daysRemaining: 16,
      documentId: null, documentName: null, documentCaseId: null, documentAvailable: false,
      notes: "PRIVATE_FIXTURE_CERTIFICATE_NOTE", revision: 0,
      createdAt: generatedAt.toISOString(), updatedAt: generatedAt.toISOString(),
    })),
  }];
  const longHtml = preparationSummary(item, evidence, [], generatedAt, personnel);
  const shortHtml = preparationSummary({ ...item, requestType: "baru" }, [], [], generatedAt);
  // Invented stress values, not input-limit examples or real applicant data.
  // Distinct prefixes/tails detect truncation, while indexed chunks detect loss
  // in the middle. Accents, Greek and Cyrillic exercise actual Unicode glyphs.
  const chunks = (prefix, count, separator) => Array.from({ length: count },
    (_, i) => `${prefix}${String(i).padStart(3, "0")}ÉlanΩЖ`).join(separator);
  const companyName = `AWALBADANUSAHA ${chunks("Usaha", 48, " ")} ${chunks("TanpaSpasi", 64, "")} AKHIRBADANUSAHA`;
  const extremeCodes = [
    ...codes,
    `AWALKATEGORIRAPAT${chunks("Kode", 100, "")}AKHIRKATEGORIRAPAT`,
    `AWALKATEGORISPASI ${chunks("Kategori", 80, " ")} AKHIRKATEGORISPASI`,
    `AWALKATEGORIUNICODE${chunks("ÅngströmΔМосква", 60, "")}AKHIRKATEGORIUNICODE`,
  ];
  const extremeHtml = preparationSummary({ ...item, companyName },
    extremeCodes.map((code, i) => ({ ...evidence[0], id: i + 1, code })), [], generatedAt, personnel);
  assert.equal((longHtml.match(/<article>/g) || []).length, 12, "personnel, all nine findings and two regulations");
  for (const html of [longHtml, shortHtml, extremeHtml]) {
    assert.doesNotMatch(html, /PRIVATE_FIXTURE|synthetic-not-a-real-account/);
  }
  return { longHtml, shortHtml, extremeHtml, companyName, extremeCodes, codes, disclaimer: SUMMARY_DISCLAIMER };
}

const compact = (text) => text.normalize("NFKC").replace(/\s+/gu, "");
const occurrences = (text, value) => text.split(value).length - 1;

export function assertExtremeSummaryContent(pages, fixture) {
  assertSummaryContent(pages, { ...fixture, codes: fixture.extremeCodes.slice(0, -3) }, "long");
  const printed = compact(pages.flatMap(page => page.words.map(word => word.text)).join(" "));
  assert.equal(occurrences(printed, compact(fixture.disclaimer)), pages.length + 2,
    "missing or duplicated declaration: one header per page plus opening notice and final footer");
  // A PDF line/page break can split a word. Remove only layout whitespace,
  // retaining every letter, digit and punctuation mark (including Unicode).
  // Repeated declarations may interrupt a paragraph across a page boundary.
  const text = printed.split(compact(fixture.disclaimer)).join("");
  assert.equal(occurrences(text, compact(fixture.companyName)), 1,
    "extreme company name missing or duplicated");
  for (const code of fixture.extremeCodes) {
    assert.equal(occurrences(text, compact(`${code} — 1 catatan deklarasi`)), 1,
      `extreme category missing or duplicated: ${code.slice(0, 40)}`);
  }
  // Check every source heading, paragraph, list entry and footer, not just
  // category sentinels: all warnings, findings, regulations and final notes.
  for (const match of fixture.extremeHtml.matchAll(/<(p|h[1-4]|li|footer)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const expected = compact(match[2].replace(/<[^>]*>/g, "")
      .replace(/&(amp|lt|gt|quot|#39);/g,
        (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]))
      .split(compact(fixture.disclaimer)).join("");
    if (expected) assert.ok(text.includes(expected), `missing complete printed block: ${expected.slice(0, 90)}`);
  }
}

export function assertSummaryContent(pages, fixture, variant) {
  const text = pages.flatMap((page) => page.words.map((word) => word.text)).join(" ");
  if (variant === "short") {
    assert.ok(text.includes("Belum ada catatan bukti."));
  } else {
    assert.ok(pages.length >= 6, `fixture must paginate substantially, got ${pages.length}`);
    for (const code of fixture.codes) {
      assert.equal(text.split(`${code} — 1 catatan deklarasi`).length - 1, 1,
        `category missing or duplicated: ${code}`);
    }
    assert.ok(text.includes("Personel Fixture Cetak"));
    assert.ok(text.includes("Penugasan: PJT"));
    assert.ok(text.includes("Jenjang: 6"));
    assert.ok(text.includes("2026-01-15 (Asia/Jakarta)"));
    for (let i = 0; i < 12; i++) {
      const number = `SKK-FIXTURE-${String(i).padStart(2, "0")}`;
      assert.equal(text.split(number).length - 1, 1, `certificate missing or duplicated: ${number}`);
    }
  }
  for (const heading of [
    "Legalitas dan identitas badan usaha", "Penjualan tahunan", "Kemampuan keuangan",
    "Tenaga kerja konstruksi", "Peralatan konstruksi", "Sistem Manajemen Anti Penyuapan (SMAP)",
    ...(variant === "long" ? [
      "Penyesuaian skema LSBU", "Pemberlakuan operasional sertifikasi", "Konversi SBU eksisting",
    ] : []),
    "Permen PU Nomor 6 Tahun 2025", "Kepdirjen Bina Konstruksi 281/KPTS/DK/2026",
    "Catatan untuk konsultasi",
  ]) assert.ok(text.includes(heading), `missing printed heading: ${heading}`);
  assert.ok(text.includes("Simpan berkas ini secara privat."), "end-of-document content preserved");
}
