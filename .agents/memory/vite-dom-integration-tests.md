---
name: Vite DOM integration tests
description: Avoid false failures when testing Vite-only modules with a synthetic DOM.
---

When a Node integration test loads application modules through Vite SSR, load their context providers through that same Vite server rather than importing the providers separately through tsx.

**Why:** Vite and Node can instantiate a local context module separately. A real mutation can then receive an empty owner header despite an apparently correct provider tree.

**How to apply:** Keep provider and consumer in the same loader's module graph; external library imports can remain shared.

Install the synthetic DOM before the first import of React DOM's client renderer.

**Why:** React DOM detects input-event support during module initialization. Importing it before the DOM exists can leave native input events unable to update controlled fields.

**How to apply:** Dynamically import the client renderer after DOM setup, and wait for the rendered success state rather than assuming mutation-cache completion also means React has committed its notification.

Do not treat Happy DOM image `load` events as proof that preview pixels decode or are readable.

**Why:** Happy DOM can emit `load` synchronously for a data URL without a real image decoder. Even non-image base64 can appear loaded, unlike a browser.

**How to apply:** Use DOM tests for state invalidation and explicit error handling; verify image decoding, intrinsic-size zoom and readability in a real browser with synthetic image fixtures.

Synthetic DOM style parsing may omit valid nested CSS math expressions.

**Why:** A nested `min()`/`calc()` height appeared as an empty inline style
in Happy DOM, even though this CSS form is valid in browsers.

**How to apply:** Do not interpret missing synthetic style values as proof of
a broken layout. Assert numeric computed branches where appropriate and
check responsive CSS in an actual browser.

Use the application's automatic JSX transform when testing a Vite component
that does not import a default React binding.

**Why:** A direct tsx import under the root test configuration can use classic
JSX and throw `React is not defined`, even though the production Vite build is
valid. Adding a global React binding masks the loader mismatch.

**How to apply:** Load the component through an isolated Vite SSR server with
automatic JSX. Disable dependency discovery for the small fixture so closing
the server does not interrupt an unrelated whole-app dependency scan.
