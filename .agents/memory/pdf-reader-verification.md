---
name: Visible PDF reader verification
description: Successful private PDF delivery does not prove an in-app page is visible.
---

Verify actual rendered page content, not only a successful PDF response,
nonempty bytes, or a `#page=` fragment.

**Why:** The native PDF iframe remained blank in the test browser despite
correct authenticated PDF bytes and page targets. That evidence established
delivery, not visible rendering. Native-reader behavior can differ by browser.

**How to apply:** When an in-app PDF preview is required, check visible content
against the intended PDF page, separately from printed slide numbering. Use
the bundled canvas renderer for reliable application previews and retain the
original PDF as a separate open/download option. Do not report a blank native
viewer as a passed visual check merely because its network request succeeded.

PDF.js browser compatibility must cover both its library and worker.
The modern build uses newer APIs such as `Map.getOrInsertComputed`; a check
in current Chromium does not establish compatibility with older Chromium.
Use the paired legacy library/worker when older browsers must be supported,
not a mixture of modern and legacy worker builds.

**Why:** The same PDF rendered in local Chromium 152 while the UI check used
Chromium 140. The legacy build supplies the missing API polyfills.
