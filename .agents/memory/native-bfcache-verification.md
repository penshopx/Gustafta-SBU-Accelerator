---
name: Native BFCache verification
description: Browser harness constraints when proving private-page restoration from real BFCache
---

Require native history traversal with both `isTrusted` and `persisted` true; synthetic lifecycle events and ordinary reloads cannot establish BFCache safety.

**Why:** The default testing browser disabled BFCache at process launch. Passing `ignoreDefaultArgs` to a context factory did not change that process. An explicitly launched Chromium process through the browser bridge, using `/repl/tools/bin/chromium` and omitting `--disable-back-forward-cache`, allowed genuine restorations.

**How to apply:** Inspect the browser's effective launch flags before debugging app eligibility. Launch through the existing browser's `browserType()` when the default helper cannot adjust launch arguments. Confirm executable availability rather than assuming the default headless-shell executable is installed. Avoid request interception that can alter cache eligibility.

For the missed-notification scenario, switch the sibling session without mounting the app's cross-tab publisher.

**Why:** A BroadcastChannel notification to the frozen app can evict the document, turning the test into an ordinary reload instead of testing recovery after missed notifications.

**How to apply:** Use a fresh test-account sign-in redirect to an API-only endpoint in the sibling tab. Observe concealment on the saved document and its first restored frame, then fresh identity verification before reopening. Label this as an intentionally silent session switch, not an ordinary UI sign-in flow. Use a server-only failure fixture if testing the app's verification-error surface: browser offline mode can instead prevent the entire document reload.
