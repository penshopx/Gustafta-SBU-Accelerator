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
