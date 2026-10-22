import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafePages, readPdfPages } from "./helpers/printed-summary.mjs";
import { summaryPrintFixture, assertSummaryContent, assertExtremeSummaryContent } from "./helpers/summary-print-fixture.mjs";

const [command, argument, ...extra] = process.argv.slice(2);
assert.ok(["export", "check"].includes(command) && extra.length === 0,
  "Usage: node test/preparation-summary-print-manual.mjs export|check [directory]");
const directory = argument ? resolve(argument) :
  fileURLToPath(new URL("../../../generated-artifacts/summary-print", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "sbu-manual-print-"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  const fixture = await summaryPrintFixture(temporary);
  if (command === "export") {
    await mkdir(directory, { recursive: true });
    // Refuse accidental replacement of someone's existing exported files.
    for (const variant of ["long", "short", "extreme"]) {
      await writeFile(join(directory, `${variant}.html`), fixture[`${variant}Html`], { flag: "wx" });
    }
    console.log(`Synthetic original-generator HTML written to ${directory}`);
    console.log("In Safari on macOS, print all three HTML files to long.pdf, short.pdf and extreme.pdf in that directory.");
    console.log("This export is NOT a Safari/WebKit pagination pass. See test/PRINT-REGRESSION.md.");
  } else {
    // Never leave an earlier success report beside newly failing inputs.
    await rm(join(directory, "pdf-check-report.json"), { force: true });
    const report = {
      checkedAt: new Date().toISOString(),
      provenance: "User-supplied native-print PDFs; browser/OS identity is not established by this checker.",
      pages: {},
    };
    for (const variant of ["long", "short", "extreme"]) {
      const html = await readFile(join(directory, `${variant}.html`), "utf8");
      assert.equal(html, fixture[`${variant}Html`], `${variant}: exported HTML differs from current synthetic fixture`);
      const pdf = await readFile(join(directory, `${variant}.pdf`));
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", `${variant}: not a PDF`);
      const pages = await readPdfPages(join(directory, `${variant}.pdf`));
      assertSafePages(pages, fixture.disclaimer);
      if (variant === "extreme") assertExtremeSummaryContent(pages, fixture);
      else assertSummaryContent(pages, fixture, variant);
      report.pages[variant] = {
        count: pages.length, htmlSha256: sha256(html), pdfSha256: sha256(pdf),
        checks: ["complete per-page warning", "no blank pages", "no text overlap/clipping", "summary content"],
      };
      console.log(`${variant}: ${pages.length} real PDF pages passed content and coordinate checks.`);
    }
    await writeFile(join(directory, "pdf-check-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log("Record Safari/macOS versions and visually inspect EVERY page before reporting Safari verified.");
    console.log("This checker does not prove browser provenance or verify a native print button.");
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
