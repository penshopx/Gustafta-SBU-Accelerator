import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, copyFile, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafePages, renderPdf } from "./helpers/printed-summary.mjs";
import { summaryPrintFixture, assertSummaryContent, assertExtremeSummaryContent } from "./helpers/summary-print-fixture.mjs";

for (const engine of ["chromium", "firefox"]) {
  test(`${engine}: native PDF repeats the complete declaration without blank pages or overlap`, {
    timeout: 360_000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), `sbu-print-${engine}-`));
    try {
      const fixture = await summaryPrintFixture(directory);
      const { longHtml: html, disclaimer } = fixture;
      const render = (content, name) => renderPdf(content, directory, name, engine);
      const pages = await render(html, "long");
      assertSafePages(pages, disclaimer);
      assertSummaryContent(pages, fixture, "long");
      t.diagnostic(`${engine}: ${pages.length} real A4 PDF pages; categories/findings and complete per-page warnings checked.`);

      await t.test("empty-evidence summary is also printable", async () => {
        const short = await render(fixture.shortHtml, "short");
        assertSafePages(short, disclaimer);
        assertSummaryContent(short, fixture, "short");
        t.diagnostic(`${engine}: ${short.length} real short-summary PDF pages checked.`);
      });
      await t.test("extreme spaced, unbroken and Unicode values remain complete and clear of warnings", async (extremeTest) => {
        const extreme = await render(fixture.extremeHtml, "extreme");
        assertSafePages(extreme, disclaimer);
        assertExtremeSummaryContent(extreme, fixture);
        t.diagnostic(`${engine}: ${extreme.length} extreme-value A4 PDF pages; all source blocks and coordinates checked.`);

        await extremeTest.test("real PDF with a missing interior name chunk fails completeness", async () => {
          const broken = await render(fixture.extremeHtml.replace("TanpaSpasi032ÉlanΩЖ", ""), "extreme-missing-name");
          assertSafePages(broken, disclaimer);
          assert.throws(() => assertExtremeSummaryContent(broken, fixture), /extreme company name missing/);
        });
        await extremeTest.test("real PDF with a missing interior Unicode category chunk fails completeness", async () => {
          const broken = await render(fixture.extremeHtml.replace("ÅngströmΔМосква030ÉlanΩЖ", ""), "extreme-missing-category");
          assertSafePages(broken, disclaimer);
          assert.throws(() => assertExtremeSummaryContent(broken, fixture), /extreme category missing/);
        });
        await extremeTest.test("disabling wrapping fails PDF safety or completeness", async () => {
          const broken = await render(fixture.extremeHtml.replace("</style>",
            "strong,li{white-space:nowrap!important}</style>"), "extreme-nowrap");
          // Chromium may omit overflow from its PDF text stream instead of
          // emitting out-of-page boxes; geometry alone cannot catch that.
          assert.throws(() => {
            assertSafePages(broken, disclaimer);
            assertExtremeSummaryContent(broken, fixture);
          }, /clipped text|content overlaps|missing complete declaration|extreme company name missing|missing or duplicated declaration/);
        });
        await extremeTest.test("losing the final warning fails even when all page headers survive", async () => {
          const broken = await render(fixture.extremeHtml.replace(`<footer>${disclaimer}<br>`, "<footer><br>"),
            "extreme-missing-footer-warning");
          assertSafePages(broken, disclaimer);
          assert.throws(() => assertExtremeSummaryContent(broken, fixture), /missing or duplicated declaration/);
        });
        await extremeTest.test("extreme text cannot be painted underneath a complete warning", async () => {
          const broken = await render(fixture.extremeHtml.replace("</style>",
            ".page-notice{position:relative;top:75mm;z-index:10}</style>"), "extreme-overlap");
          assert.throws(() => assertSafePages(broken, disclaimer), /content overlaps declaration/);
        });
      });
      await t.test("guard rejects a real PDF after repeating header is removed", async () => {
        const broken = await render(html.replace(/<thead>[\s\S]*?<\/thead>/, ""), "missing-warning");
        assert.throws(() => assertSafePages(broken, disclaimer), /missing complete declaration/);
      });
      await t.test("guard rejects a real PDF with warning text painted over body content", async () => {
        const overlapping = html.replace("</style>",
          ".page-notice{position:fixed;top:100mm;left:0;width:100%;z-index:10}</style>");
        const broken = await render(overlapping, "overlap");
        assert.throws(() => assertSafePages(broken, disclaimer), /content overlaps declaration/);
      });
      await t.test("guard rejects an appended blank PDF page", async () => {
        const broken = await render(html.replace("</body>",
          '<div style="break-before:page;height:50mm"></div></body>'), "blank-page");
        assert.ok(broken.length > pages.length, "negative fixture must add a real blank PDF page");
        assert.equal(broken.at(-1).words.length, 0, "last page is genuinely empty");
        assert.throws(() => assertSafePages(broken, disclaimer), /missing complete declaration/);
      });
      await t.test("guard also rejects a page containing only its declaration", () => {
        const first = pages[0];
        const start = first.words.findIndex((word) => word.text === "Data");
        const words = first.words.slice(start, start + disclaimer.split(/\s+/).length);
        assert.throws(() => assertSafePages([{ ...first, words }], disclaimer), /blank or warning-only page/);
      });
      if (engine === "chromium") {
        await t.test("manual PDF checker accepts real PDFs but rejects missing files, changed HTML and invalid PDFs", async () => {
          const destination = join(directory, "manual-export");
          const script = fileURLToPath(new URL("./preparation-summary-print-manual.mjs", import.meta.url));
          const run = (command) => promisify(execFile)(process.execPath,
            [script, command, destination], { timeout: 30_000 });
          await run("export");
          await assert.rejects(run("export"), /EEXIST/);
          await assert.rejects(run("check"), /ENOENT/);
          for (const name of ["long", "short", "extreme"]) {
            await copyFile(join(directory, `${name}.pdf`), join(destination, `${name}.pdf`));
          }
          await run("check");
          const report = JSON.parse(await readFile(join(destination, "pdf-check-report.json"), "utf8"));
          assert.equal(report.pages.long.count, pages.length);
          assert.ok(report.pages.extreme.count > report.pages.long.count);
          assert.match(report.pages.long.pdfSha256, /^[a-f0-9]{64}$/);
          assert.match(report.provenance, /not established/);
          await copyFile(join(directory, "extreme-missing-name.pdf"), join(destination, "extreme.pdf"));
          await assert.rejects(run("check"), /extreme company name missing/);
          await assert.rejects(readFile(join(destination, "pdf-check-report.json")), /ENOENT/);
          await copyFile(join(directory, "extreme.pdf"), join(destination, "extreme.pdf"));
          await writeFile(join(destination, "long.html"), html.replace("Usaha Fixture Cetak", "Different fixture"));
          await assert.rejects(run("check"), /exported HTML differs/);
          await assert.rejects(readFile(join(destination, "pdf-check-report.json")), /ENOENT/);
          await writeFile(join(destination, "long.html"), html);
          await copyFile(join(directory, "missing-warning.pdf"), join(destination, "long.pdf"));
          await assert.rejects(run("check"), /missing complete declaration/);
          t.diagnostic("Manual checker exercised with Chromium PDFs only; no Safari provenance claimed.");
        });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("Safari/WebKit PDF pagination: not verified by this Linux headless suite", {
  skip: "Safari needs macOS native Print > Save as PDF; Playwright WebKit has no PDF output. See PRINT-REGRESSION.md.",
}, () => {});
