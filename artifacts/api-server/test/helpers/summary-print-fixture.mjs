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
  const longHtml = preparationSummary(item, evidence, [], generatedAt);
  const shortHtml = preparationSummary({ ...item, requestType: "baru" }, [], [], generatedAt);
  assert.equal((longHtml.match(/<article>/g) || []).length, 11, "all nine findings and two regulations");
  for (const html of [longHtml, shortHtml]) {
    assert.doesNotMatch(html, /PRIVATE_FIXTURE|synthetic-not-a-real-account/);
  }
  return { longHtml, shortHtml, codes, disclaimer: SUMMARY_DISCLAIMER };
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
