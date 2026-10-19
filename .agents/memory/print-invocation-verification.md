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
