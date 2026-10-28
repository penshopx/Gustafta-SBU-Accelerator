---
name: Theme compatibility
description: Shared theme tokens are preferred; fixed-colour overrides are only a migration bridge.
---

Use semantic theme tokens for new UI, not new hardcoded light-only colours.
Fixed-colour dark overrides are a compatibility bridge for existing components.

**Why:** Existing features had many fixed light backgrounds and dark text.
Changing only shared surfaces made those combinations unreadable in dark mode.
A bounded compatibility palette avoided unrelated business-component refactors.

**How to apply:** Check background/text pairs together, including alerts,
badges, forms and buttons. Do not invert video, illustrations or PDF pixels.
Keep print colours separate from screen themes. Prefer migrating a touched
component to tokens rather than adding more fixed colours to the bridge.
