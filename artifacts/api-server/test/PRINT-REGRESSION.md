# Preparation-summary print regression

Run `pnpm --filter @workspace/api-server test:print`.
The default API `test` command also includes this test; missing browser/PDF tools
fail the test rather than silently skipping coverage.

Requirements: Chromium (`chromium` on PATH, or `CHROMIUM_BIN`), Firefox
(`firefox` on PATH, or `FIREFOX_BIN`), geckodriver (`geckodriver` on PATH, or
`GECKODRIVER_BIN`), and Poppler (`pdftotext` on PATH). Replit's Nix configuration
includes Firefox and geckodriver. On other CI hosts install all four tools
before running the command. Missing Chromium/Firefox/driver/Poppler is a failure,
not a skip or a fallback to a different browser.

The test bundles the **real** preparation-summary generator and rule engine,
prints local HTML in fresh headless Chromium **and Firefox** profiles with A4 CSS, and inspects
every PDF page's words and coordinates using Poppler. It covers 186 synthetic
categories, all nine renewal findings, both regulation references, and a
no-evidence new-application summary. It requires the full declaration
(including document verification, eligibility and LSBU decision exclusions)
on each page, nonempty body content, unclipped text, and no body text overlapping
the repeated notice or final footer declaration. Category and finding checks
also catch lost or duplicated content.

The `extreme` variant retains all 186 original categories, nine findings,
personnel/SKK and references, and adds three synthetic category codes of
1,335, 1,476 and 1,479 characters plus a 1,967-character company name.
Indexed chunks exercise both spaces and long unbroken runs, with accented Latin,
Greek and Cyrillic text (`É`, `Å`, `ö`, `Ω`, `Δ`, `Ж`, `Москва`).
These are stress fixtures, not a claim about application input limits.
Every complete company/category value must occur exactly once. Every source
heading, paragraph, list item and footer must survive PDF extraction, including
all findings, source details, warnings and end notes. Layout whitespace is
removed for these comparisons so line/page wrapping within words is allowed;
no letters, digits or punctuation are discarded. Repeated declarations are
removed only for block comparisons, after checking their exact count:
one per page plus the opening notice and final footer.
The same per-page coordinate, no-overlap/clipping and nonblank-body assertions
apply to the extreme PDFs in both engines.

Negative controls print modified HTML with the repeating warning removed,
positioned over the body, or followed by a genuinely blank PDF page.
A warning-only-page control verifies the body-content guard too.
Additional extreme-value controls print actual PDFs with an interior company
chunk removed, an interior Unicode category chunk removed, wrapping disabled,
the final footer warning removed while page headers survive, or the complete
warning positioned over the extreme body. Each must fail the relevant content
or coordinate assertion. Geometry alone is insufficient: Chromium can omit
overflow text from the PDF stream rather than expose out-of-page word boxes,
so the no-wrap control checks both geometry and full-value completeness.
The existing template deliberately repeats its warning through a table header,
not a fixed footer overlay; the test checks the outcome without changing export
features. This is pagination coverage, not a native print-dialog/button test.

Firefox uses geckodriver's native WebDriver `POST /session/{id}/print` command,
which returns actual base64 PDF bytes. It does **not** use Playwright's
Chromium-only `page.pdf()`. Both engines run the exact same fixture builder,
positive assertions, and negative controls, independently; identical page counts
are not required. The A4 portrait paper and margins are specified explicitly
for WebDriver (centimetres) as well as in CSS.

No app workflow, database, network login, production authentication or user data
is needed. No runtime database/auth imports survive the bundle. All fixtures
are invented and private-note markers must not reach HTML. Chromium disables
DNS resolution; Firefox refuses browser HTTP(S) through a closed loopback
proxy, disables DNS prefetch/DoH, and retains the original restrictive CSP.
The only server is geckodriver on an ephemeral loopback port. Its session and
process group are terminated in `finally`. Test HTML/PDF/Chromium profiles
are temporary; geckodriver creates and removes its own temporary Firefox profile.
Its profile root is inside the test directory so even a crashed render's
remaining profile is removed by the outer cleanup.
No generated PDFs enter Git or deployment output.

PDF text is normalized with Unicode NFKC when extracting words: Firefox may
encode `fi` as the single ligature `ﬁ`. This prevents false missing-warning or
missing-category reports without dropping words, changing coordinates, or
weakening the required complete warning. Both engines still run the real-PDF
negative controls.

### Recorded automated result (2026-10-20)

Firefox 140.0.4 with geckodriver 0.36.0 and Chromium 152.0.7977.64 produced **10 A4 pages**
for the long fixture and **4 pages** for the no-evidence fixture. Both passed
the complete-warning, no-overlap/clipping, nonblank-page, and content assertions;
all intentionally broken-PDF controls were rejected. Safari/WebKit is **not
verified**. The manual checker is regression-tested using known Chromium PDFs,
including missing-file, changed-HTML and invalid-warning rejection; this does
not add Safari evidence.
The final run reported **13 passed, 0 failed, 1 explicit Safari/WebKit skip**.
All ten pages of the long Firefox PDF were also rendered to images and
visually inspected: the warning and body text were visible and separated,
including the findings/regulations transitions and the final page. These
images came from the actual PDF, not print-media screenshots.

### Extreme-value result (2026-10-22)

Chromium 152.0.7977.64 produced **16 A4 pages** and Firefox 140.0.4 /
geckodriver 0.36.0 produced **18 A4 pages** for `extreme`. Both passed complete
company/category/source-block comparisons, exact declaration counts, per-page
warning and coordinate checks, and nonblank-page checks. The original long and
short fixtures remained covered (Chromium: 14 / 5 pages; Firefox: 15 / 4 pages).
All extreme negative controls were rejected in both engines. Chromium's manual
checker also covers the extreme PDF, including rejection of an interior-name
deletion and removal of stale success reports.
Pages 1–3 and the final page of the actual Chromium extreme PDF were rasterized
for a supplementary visual spot check of the Unicode values, a split category
and the final warning. This is not a full visual inspection of every page,
not Safari evidence, and not a claim of font coverage for every Unicode script.
Safari remains explicitly unverified.
Final `test:print` result: **25 passed, 0 failed, 1 explicit Safari/WebKit skip**.

## Alternate paper and scale regression (2026-10-22)

The original A4 portrait, 100% CLI/WebDriver cases and all negative controls
remain unchanged. A separate matrix prints **long, short and extreme** fixtures
at Letter (215.9 × 279.4 mm), A4 at 125%, and Letter requested at 125%.
It checks every page's actual PDF dimensions (points, 72 pt/in; tolerance
below 2 pt for browser rounding), not just the requested paper. TAP diagnostics
record requested settings, effective paper, measured dimensions and page counts.
The 125% cases also compare the first warning word's PDF glyph-box height
against its same-engine, same-paper 100% counterpart (ratio 1.25 ± 0.03);
passing a scale option without changing the printed text cannot pass.

Each matrix entry runs the unchanged complete-warning/no-clipping/no-overlap/
no-blank-or-warning-only-page guard, checks categories/findings/certificates/
end notes, and compares **every source heading, paragraph, list entry and
footer**, with exact declaration counts. Extreme values additionally retain
their complete-value checks. All checks run even if one fails, with PASS/FAIL
diagnostics for dimensions, geometry, content and scale. There is no
expected-failure allowance for missing warnings or content. Source comparisons
normalize only layout whitespace and compatibility glyphs, not lost letters.

### What the controls mean in each browser

- **Chromium:** the baseline still uses `--print-to-pdf`. Alternate settings
  use native DevTools `Page.printToPDF` over inherited debugging pipes (no
  debugging TCP server), with fresh profiles, local files, disabled DNS and
  the real generator's CSP. `preferCSSPageSize:true` lets
  `@page{size:A4}` **override a Letter request**, so that result is A4,
  not evidence of Letter output. `preferCSSPageSize:false` produces Letter
  sheets but scales the CSS A4 layout to fit; it is **not** a claim of native
  Letter reflow. `scale:1.25` is tested with both effective paper sizes.
- **Firefox:** geckodriver's native Print Page accepts paper dimensions in
  centimetres and `scale`, but WebDriver has **no `preferCSSPageSize`
  parameter**. The shared setting of that name is used only by Chromium,
  never sent to Firefox. In the measured Firefox build the original
  `@page{size:A4}` wins over requested Letter at both 100% and 125%, producing
  A4 PDFs. To exercise actual Letter pagination too, two explicitly labelled
  **diagnostic-only** cases replace only `@page{size:A4;` with
  `@page{size:auto;` in the generated synthetic HTML, at 100% and 125%.
  No margin, warning, wrapping or other template rule is changed. This does
  **not** change the generator, exported application HTML or A4 baseline, and
  does not imply the original Firefox export honors the paper selection.
- **Safari/WebKit:** still explicitly skipped/unverified on Linux; no PDF
  settings are simulated with screenshots. Native macOS evidence is required
  as below.

These are native headless PDF API settings, not automation of the OS print
dialog, a physical printer, browser-added headers/footers, or every possible
scale. Coverage of 100%/125% does not certify arbitrary zoom, extreme scales,
printer minimum margins or driver overrides. PDF text geometry cannot prove
font rasterization, contrast or arbitrary graphic occlusion. Existing
negative controls still verify that missing declarations, lost Unicode chunks,
overlap, overflow and blank pages are rejected.

### Measured matrix

Dimensions below are extracted from every page, not inferred from the API.
Page-count columns are **long / short / extreme**.

| Engine | Requested settings | Actual page size (pt) | Pages | Result |
| --- | --- | --- | --- | --- |
| Chromium 152.0.7977.64 | Letter, 100%, prefer CSS | 594.95996 × 841.91998 (A4) | 14 / 5 / 16 | PASS |
| Chromium | Letter, 100%, prefer paper | 612 × 792 (Letter) | 14 / 5 / 16 | PASS |
| Chromium | A4, 125%, prefer CSS | 594.95996 × 841.91998 (A4) | 19 / 6 / 23 | PASS |
| Chromium | Letter, 125%, prefer paper | 612 × 792 (Letter) | 19 / 6 / 23 | PASS |
| Firefox 140.0.4 / geckodriver 0.36.0 | Letter, 100%, original CSS | 596 × 842 (A4) | 15 / 4 / 18 | PASS |
| Firefox | Letter, 100%, diagnostic `size:auto` | 612 × 792 (Letter) | 16 / 4 / 18 | PASS |
| Firefox | Letter, 125%, diagnostic `size:auto` | 612 × 792 (Letter) | 22 / 7 / 26 | PASS |
| Firefox | A4, 125%, original CSS | 596 × 842 (A4) | 21 / 6 / 25 | PASS |
| Firefox | Letter, 125%, original CSS | 596 × 842 (A4) | 21 / 6 / 25 | PASS |

For these measured rows: no missing/duplicated checked source content, no
out-of-page word boxes, no warning/body overlap, and zero blank/warning-only
pages were detected; every page contained the full required warning.
This is extracted-text/coordinate evidence, not a full visual inspection.
As a supplementary visual spot check, the actual Firefox diagnostic Letter
extreme PDF was rasterized at page 1 (100%) and pages 1 and 26 (125%).
The warning remained visible and separate from the body; the enlarged warning
wrapped onto two lines, and the last page retained its body/end note and final
declaration. This is not inspection of every page, not Safari evidence, and
not proof of a working application print button.

Final `pnpm --filter @workspace/api-server test:print` result for this matrix:
**54 passed, 0 failed, 1 explicit Safari/WebKit skip** (55 tests total),
including all unchanged A4 positive and negative cases.

## Safari / WebKit: explicit automation limit, NOT a passing result

This Linux suite cannot produce a Safari PDF. Safari and its native
`safaridriver` require Apple's environment; installing a Linux WebKit browser
does not turn it into Safari. Playwright's WebKit backend does not expose PDF
generation. A print-media screenshot, WebKit screen layout, DOM `thead` check,
`beforeprint` event or Chromium-generated PDF is **not** evidence of WebKit
pagination. No screenshot workaround is used here.

The test runner deliberately reports Safari/WebKit as **SKIP**, with the reason
visible in TAP output. Green automated Chromium/Firefox tests do **not** mean
Safari passed. Safari pagination remains **unverified** until real native PDFs
are supplied and reviewed. This is the documented headless-output limitation
allowed by the task, not a claim of cross-browser certification.

References (checked 2026-10-20):
- [Playwright PDF implementation](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/dispatchers/pageDispatcher.ts):
  rejects a browser without PDF support with
  `PDF generation is only supported for Headless Chromium`.
- [Apple: Testing with WebDriver in Safari](https://developer.apple.com/documentation/webkit/testing-with-webdriver-in-safari):
  describes the Safari-bundled `/usr/bin/safaridriver`, not a Linux Safari runner.
- [WebDriver Print Page](https://w3c.github.io/webdriver/#print-page):
  the standard print command used by the Firefox adapter.

### Reproducible native Safari PDF procedure (macOS, no account)

1. At the same code revision, export the **same** synthetic fixture, using the
   original generator (not a hand-recreated HTML template):
   ```
   pnpm --filter @workspace/api-server exec node test/preparation-summary-print-manual.mjs export
   ```
   This writes `long.html`, `short.html` and `extreme.html` to the workspace's ignored
   `generated-artifacts/summary-print/`. An optional final directory argument
   changes the destination. Existing HTML files are not overwritten: choose a
   new directory for another export.
2. Transfer only these synthetic HTML files to a Mac. Open each as a local file
   in **Safari**, not a preview app. No app server, sign-in or production access
   is needed. Record Safari build/version, macOS version, and code revision.
3. Choose File > Print, show details, A4, portrait, 100% scale; disable Safari
   browser headers and footers. Keep the generator's page margins (18 mm top,
   16 mm sides, 28 mm bottom); record the effective print settings. Use the
   native PDF > Save as PDF action to create `long.pdf`, `short.pdf` and `extreme.pdf`.
   Do not use screenshots, single-page capture, reader mode, or a conversion
   service. Preserve every page, not just the first.
4. Place all three PDFs alongside the exported HTML files. Back in this workspace
   (or on a host with Node, workspace dependencies, and Poppler), run:
   ```
   pnpm --filter @workspace/api-server exec node test/preparation-summary-print-manual.mjs check
   ```
   Use the same optional directory argument if a custom destination was used.
   Missing files, a changed HTML fixture, missing category/finding/end content,
   incomplete warning on any page, blank/warning-only pages, text outside the
   page, or text overlapping a warning **fail** the command. It writes
   `pdf-check-report.json` with page counts and HTML/PDF SHA-256 fingerprints.
   It also records each page's actual width and height in PDF points.
   These are checks of the supplied PDF, **not proof of which browser made it**;
   keep the recorded browser/OS/settings evidence with the report.
5. Visually inspect **every** PDF page at readable size, particularly page
   transitions and the last page. Confirm the complete warning is visible,
   body text is not hidden, all categories/findings/end notes are intact, and
   there is no blank page. Bounding-box assertions cannot prove font rendering,
   non-text graphics, contrast or arbitrary painted occlusion.
6. Record measured page counts, report, visual inspection result and any
   failures. Never record Safari as passed unless all three genuine Safari PDFs
   pass the checker **and** the visual inspection. If table-header repetition
   differs, preserve the failing synthetic PDF and fix the generator separately;
   do not relax the warning checks or substitute a Chromium PDF.

Generated HTML, PDF and reports remain in the ignored `generated-artifacts/`
directory; delete them after collecting evidence. Do not add them to Git or
deployment output. This procedure is pagination testing, **not BFCache privacy
testing**, an app-native-print-button test, or proof that a visible OS print
dialog can be automated.

For alternate Safari print settings, repeat the procedure in a **separate
export directory per setting**, keeping all three fixture files and PDFs:
Letter at 100%, A4 at 125%, and Letter at 125%, all portrait with browser
headers/footers disabled. Do not edit the original HTML to force a requested
paper size. Record both requested settings and actual dimensions from the
report: if CSS overrides Letter, label the output A4, not a Letter pass.
Keep PDF reports, Safari/macOS versions and every-page visual inspection
results together. Missing/clipped content, overlap or blank pages are
failures, not acceptable paper/scale differences. No alternate Safari setting
has been verified by this Linux suite.
