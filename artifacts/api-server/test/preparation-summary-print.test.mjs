import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { assertSafePages, renderPdf } from "./helpers/printed-summary.mjs";

const source = fileURLToPath(new URL("../src/lib/preparation-summary.ts", import.meta.url));
const generatedAt = new Date("2026-01-15T12:00:00Z");
const item = {
  id: 1, ownerId: "synthetic-not-a-real-account", companyName: "Usaha Fixture Cetak",
  requestType: "perpanjangan", qualification: "kecil", classification: "gedung",
  status: "draf", existingSbuExpiresOn: "2028-01-01",
  createdAt: generatedAt, updatedAt: generatedAt,
};

test("headless PDF repeats the complete declaration on every long-summary page without overlap", {
  timeout: 240_000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sbu-print-regression-"));
  try {
    const bundle = join(directory, "summary.mjs");
    // Type-only database imports disappear: no DB, Clerk, app server or secrets.
    await build({ entryPoints: [source], outfile: bundle, bundle: true, platform: "node", format: "esm" });
    const { preparationSummary, SUMMARY_DISCLAIMER } = await import(pathToFileURL(bundle).href);
    const codes = [
      "legalitas", "penjualan", "keuangan", "tenaga", "peralatan", "smap_commitment",
      ...Array.from({ length: 180 }, (_, i) => `kategori-fixture-${String(i).padStart(3, "0")}`),
    ];
    const evidence = codes.map((code, i) => ({
      id: i + 1, caseId: item.id, code,
      title: "PRIVATE_FIXTURE_TITLE", note: "PRIVATE_FIXTURE_NOTE", updatedAt: generatedAt,
    }));
    const html = preparationSummary(item, evidence, [], generatedAt);
    assert.equal((html.match(/<article>/g) || []).length, 11, "all nine findings and two regulations");
    assert.doesNotMatch(html, /PRIVATE_FIXTURE|synthetic-not-a-real-account/);
    const pages = await renderPdf(html, directory, "long");
    assert.ok(pages.length >= 6, `fixture must paginate substantially, got ${pages.length}`);
    assertSafePages(pages, SUMMARY_DISCLAIMER);
    const text = pages.flatMap((page) => page.words.map((word) => word.text)).join(" ");
    for (const code of codes) {
      assert.equal(text.split(`${code} — 1 catatan deklarasi`).length - 1, 1,
        `category missing or duplicated: ${code}`);
    }
    for (const heading of [
      "Legalitas dan identitas badan usaha", "Penjualan tahunan", "Kemampuan keuangan",
      "Tenaga kerja konstruksi", "Peralatan konstruksi", "Sistem Manajemen Anti Penyuapan (SMAP)",
      "Penyesuaian skema LSBU", "Pemberlakuan operasional sertifikasi", "Konversi SBU eksisting",
      "Permen PU Nomor 6 Tahun 2025", "Kepdirjen Bina Konstruksi 281/KPTS/DK/2026",
      "Catatan untuk konsultasi",
    ]) assert.ok(text.includes(heading), `missing printed heading: ${heading}`);
    assert.ok(text.includes("Simpan berkas ini secara privat."), "end-of-document content preserved");
    t.diagnostic(`Chromium rendered ${pages.length} A4 pages; all categories/findings and per-page warnings checked.`);

    await t.test("empty-evidence summary is also printable", async () => {
      const short = await renderPdf(preparationSummary({ ...item, requestType: "baru" }, [], [], generatedAt),
        directory, "short");
      assertSafePages(short, SUMMARY_DISCLAIMER);
      assert.ok(short.flatMap((page) => page.words.map((word) => word.text)).join(" ")
        .includes("Belum ada catatan bukti."));
    });
    await t.test("guard rejects a real PDF after repeating header is removed", async () => {
      const broken = await renderPdf(html.replace(/<thead>[\s\S]*?<\/thead>/, ""), directory, "missing-warning");
      assert.throws(() => assertSafePages(broken, SUMMARY_DISCLAIMER), /missing complete declaration/);
    });
    await t.test("guard rejects a real PDF with warning text painted over body content", async () => {
      const overlapping = html.replace("</style>",
        ".page-notice{position:fixed;top:100mm;left:0;width:100%;z-index:10}</style>");
      const broken = await renderPdf(overlapping, directory, "overlap");
      assert.throws(() => assertSafePages(broken, SUMMARY_DISCLAIMER), /content overlaps declaration/);
    });
    await t.test("guard rejects an appended blank PDF page", async () => {
      const broken = await renderPdf(html.replace("</body>",
        '<div style="break-before:page;height:50mm"></div></body>'), directory, "blank-page");
      assert.ok(broken.length > pages.length, "negative fixture must add a real blank PDF page");
      assert.equal(broken.at(-1).words.length, 0, "last page is genuinely empty");
      assert.throws(() => assertSafePages(broken, SUMMARY_DISCLAIMER), /missing complete declaration/);
    });
    await t.test("guard also rejects a page containing only its declaration", () => {
      const first = pages[0];
      const start = first.words.findIndex((word) => word.text === "Data");
      const words = first.words.slice(start, start + SUMMARY_DISCLAIMER.split(/\s+/).length);
      assert.throws(() => assertSafePages([{ ...first, words }], SUMMARY_DISCLAIMER),
        /blank or warning-only page/);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
