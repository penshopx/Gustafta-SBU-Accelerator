---
name: Document validation boundaries
description: Why document format checks must go beyond a PDF header without implying malware or evidence verification
---

Document upload tests must include malformed PDFs with a legitimate PDF header, not only files with a mismatched MIME type. Format validation must reject these before treating a document as stored.

**Why:** A real browser/storage test showed that a header-only check accepted non-PDF text prefixed with `%PDF-1.4` as a completed document. Successful upload and matching MIME metadata did not establish readable PDF structure.

**How to apply:** Preserve structurally valid PDF and malformed-header/forged-EOF regression cases when revising upload validation. Keep format checks separate from malware scanning, legal authenticity, and evidence verification; do not imply those checks have been performed.
