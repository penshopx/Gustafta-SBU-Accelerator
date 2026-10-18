---
name: PDF page isolation
description: Privacy boundary for sending selected pages from a larger PDF to AI
---

Page selection for AI must rebuild an image-only PDF from locally rendered selected pages, rather than copying source PDF page objects.

**Why:** Source pages can share resource dictionaries or link to unrelated objects, attachments, hidden text, and other pages. Copying a page tree does not establish that unselected content is absent. Rasterization deliberately trades searchable text and fine detail for a narrower data boundary.

**How to apply:** Preserve pixel-level comparisons of the actual outgoing payload against selected source pages, with unique per-page markers, hidden content, metadata, attachments, and cross-page references. Keep original page order snapshots and the image-quality limitation visible to human reviewers.
