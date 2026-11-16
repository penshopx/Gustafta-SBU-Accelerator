---
name: Browser virtual clocks and query notifications
description: Deterministic browser quota tests must flush scheduled UI work and deliver bubbling visibility events.
---

When pausing a browser clock, advance it slightly while awaiting UI changes rather than waiting solely for DOM polling inside the page.

**Why:** TanStack Query batches observer notifications through zero-delay timers, while browser DOM waiters may use animation frames. Pausing both can prevent a completed fetch from reaching the DOM and make a correct UI appear broken.

**How to apply:** Drive small timer increments from the test process while checking the DOM. Keep these increments far below the polling interval so a focus-only assertion cannot accidentally pass through polling.

Headless Chromium can report multiple pages as visible despite bringing one to the front. Controlled visibility tests must deliver a bubbling document visibility event.

**Why:** The installed query library listens on the window; a non-bubbling synthetic document event misses that listener. Headless page focus alone therefore does not establish the intended visibility transition.

**How to apply:** Document simulated visibility versus native suspension explicitly. Retain the real query listener and do not call refetch or replace the focus manager from the fixture.

Clock-control browser tests should derive their simulated reset instant from a future date instead of pinning a past calendar date.

**Why:** Playwright's clock cannot pause by fast-forwarding backward from the real browser clock; fixed historical fixtures eventually fail even when application behavior is unchanged.

**How to apply:** Choose a stable future boundary at test start, derive before/after timestamps and expected localized dates from it, and keep the product scenario unchanged.
