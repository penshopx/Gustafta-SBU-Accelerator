# Preparation-summary print regression

Run `pnpm --filter @workspace/api-server test:print`.
The default API `test` command also includes this test; missing browser/PDF tools
fail the test rather than silently skipping coverage.

Requirements: Chromium (`chromium` on PATH, or `CHROMIUM_BIN`), and Poppler
(`pdftotext` on PATH). Replit's current environment provides both. On other CI
hosts install Chromium and Poppler before running the command.

The test bundles the **real** preparation-summary generator and rule engine,
prints local HTML in a fresh headless Chromium profile with A4 CSS, and inspects
every PDF page's words and coordinates using Poppler. It covers 186 synthetic
categories, all nine renewal findings, both regulation references, and a
no-evidence new-application summary. It requires the full declaration
(including document verification, eligibility and LSBU decision exclusions)
on each page, nonempty body content, unclipped text, and no body text overlapping
the repeated notice or final footer declaration. Category and finding checks
also catch lost or duplicated content.

Negative controls print modified HTML with the repeating warning removed,
positioned over the body, or followed by a genuinely blank PDF page.
A warning-only-page control verifies the body-content guard too.
The existing template deliberately repeats its warning through a table header,
not a fixed footer overlay; the test checks the outcome without changing export
features. This is pagination coverage, not a native print-dialog/button test.

No app workflow, database, network login, production authentication or user data
is needed. No runtime database/auth imports survive the bundle. All fixtures
are invented, private-note markers must not reach HTML, and HTML/PDF/browser
profiles are created under the OS temporary directory and removed even on
failure. No generated PDFs enter Git or deployment output.
