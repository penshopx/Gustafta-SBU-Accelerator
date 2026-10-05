---
name: Print invocation verification
description: Printable file rendering does not prove that the application's browser print action works.
---

Treat native print invocation and PDF pagination as separate checks. A successful PDF render of exported HTML is not proof that the application's print button works.

**Why:** A Chromium check produced a readable, multi-page PDF with the required disclaimer on every page while the application's disabled-script sandbox emitted a blocked-execution error during print. Allowing modals alone did not make that browser invocation clean.

**How to apply:** When changing consultation exports, verify the actual iframe print call as well as the rendered page disclaimers. Preserve escaped content and a restrictive content security policy; do not assume sandbox flags or static HTML tests establish native-print compatibility. Check page images too: extracted PDF text can contain the disclaimer while its fixed positioning hides underlying content. Repeated warnings need reserved layout space, not just a visual overlay.
