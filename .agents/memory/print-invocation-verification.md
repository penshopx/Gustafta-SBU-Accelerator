---
name: Print invocation verification
description: Printable file rendering does not prove that the application's browser print action works.
---

Treat native print invocation and PDF pagination as separate checks. A successful PDF render of exported HTML is not proof that the application's print button works.

**Why:** A Chromium check produced a readable, multi-page PDF with the required disclaimer on every page while the application's disabled-script sandbox emitted a blocked-execution error during print. Allowing modals alone did not make that browser invocation clean.

**How to apply:** When changing consultation exports, verify the actual iframe print call as well as the rendered page disclaimers. Preserve escaped content and a restrictive content security policy; do not assume sandbox flags or static HTML tests establish native-print compatibility. Check page images too: extracted PDF text can contain the disclaimer while its fixed positioning hides underlying content. Repeated warnings need reserved layout space, not just a visual overlay.

Native-print instrumentation must bind the method from the loaded `srcdoc` Window, not its initial `about:blank` Window. Require a trusted `beforeprint` event to prove entry into the browser's native print lifecycle.

**Why:** Binding before navigation can silently target an inactive Window. Headless Chromium can emit trusted `beforeprint` without a closing `afterprint`; waiting for the latter does not reliably establish whether native invocation succeeded.

**How to apply:** Separate native invocation evidence from deterministic disposal tests. Dispatch a controlled `afterprint` for cleanup coverage when headless printing does not emit it, and explicitly document that this does not verify a visible operating-system print dialog.

Compare PDF text semantically across engines, preserving all geometry and complete-warning requirements; compatibility ligatures are not missing letters.

**Why:** Firefox PDF fonts can encode `fi` as a single ligature while Chromium emits separate letters. Raw extracted-string matching then falsely reports a missing disclaimer on an otherwise correct PDF.

**How to apply:** Normalize compatibility glyphs in extracted words, not coordinates or source HTML. Keep real-PDF negative controls so normalization cannot conceal missing warnings or overlapping text. Playwright's lack of Firefox PDF output does not mean Firefox cannot print: its native WebDriver print command can produce actual PDFs. Never substitute Chromium or print-media screenshots for unverified Safari/WebKit pagination.

Require both complete source-text checks and coordinate checks for extreme print values.

**Why:** Chromium may omit unwrapped overflow from its PDF text stream entirely, leaving only valid in-page boxes. A coordinate-only guard can therefore pass a PDF that lost part of a company name or category.

**How to apply:** Compare complete synthetic values (including interior chunks and Unicode) after normalizing layout whitespace, in addition to checking every page's warning, bounds and overlap. Use real PDFs with wrapping disabled as negative controls; do not require every engine to expose missing overflow as out-of-bounds boxes.
