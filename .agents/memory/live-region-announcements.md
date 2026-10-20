---
name: Live-region announcement evidence
description: Distinguish accessible live-region updates from verified speech output.
---

Keep success live regions mounted empty before inserting a message; repeated
identical messages need an observable empty update before reinsertion.

**Why:** Inserting an already-populated status node can be missed by assistive
technology, especially when a saved response remounts the form. Finding a role
and its text in a DOM test proves neither an announcement nor its frequency.

**How to apply:** Observe text changes on the same live-region node through
cache-driven remounts and repeated unchanged saves. Cancel delayed messages on
owner change/unmount. Label automated evidence as the announcement contract,
not verified speech; actual speech needs a real browser/screen-reader pairing.

For DOM identity assertions, compare references with `assert.ok(a === b)` and a
short message rather than printing mismatched DOM objects with `assert.equal`.

**Why:** Node's assertion formatter can exhaust memory traversing Happy DOM
objects, killing the test process before reporting the actual mismatch.

**How to apply:** Wait for asynchronous query notifications before capturing a
node reference, and keep reference-mismatch diagnostics bounded.
