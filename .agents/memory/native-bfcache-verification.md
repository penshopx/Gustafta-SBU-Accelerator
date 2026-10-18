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

Avoid instantiating even the standalone Clerk browser SDK while the target is frozen.

**Why:** An app-free login document still emitted Clerk's own BroadcastChannel message; Chromium reported `broadcastchannel-message` and performed an ordinary reload. Avoiding only Gustafta's publisher did not reproduce a missed-notification restore.

**How to apply:** Prepare real test sessions before freezing, then silently switch their cookie jars in the isolated browser context, keeping cookies in memory only. Confirm the new identity through an API-only sibling. Record browser-provided non-restoration reasons without URLs or identifiers; never reinterpret an evicted document as a BFCache pass.

Put the restore target in the foreground before requiring first-animation-frame evidence.

**Why:** Headless Chromium still suspends animation frames in hidden tabs. A trusted persisted pageshow alone can be recorded while its rAF callback never runs before the guard's reload replaces the document.

**How to apply:** Activate the target while it is still on the neutral history document. If loopback HTML reloads outrun painting, explicit test-server latency can make the genuine restored frame observable without altering app code or simulating lifecycle events.
