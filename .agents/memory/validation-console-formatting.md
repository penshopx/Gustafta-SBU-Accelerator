---
name: Validation console formatting
description: Configured validation may force colored output even when subprocess streams are piped
---

Do not assume piped subprocess output is plain text when asserting CLI diagnostics.

**Why:** Configured validation can inherit forced terminal coloring while an ordinary shell run does not. Assertions that passed locally can then fail on ANSI escapes inserted between words.

**How to apply:** Normalize terminal control characters before matching human-readable subprocess messages, and check affected regression tests with forced coloring when they depend on CLI output.
