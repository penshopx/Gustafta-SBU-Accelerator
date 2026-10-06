---
name: Workspace package installation
description: Root scope, scoped package links, and Python scaffold side effects of dependency installation callbacks.
---

For Node.js, the language-package installation callback runs a root-level pnpm add and cannot target a workspace package directly.

**Why:** A scoped frontend test dependency was declared but its import still failed after updating only the lockfile; the package symlink was not created until the offline install refreshed links. A callback attempt to add the package failed with pnpm's workspace-root guard.

**How to apply:** When a dependency belongs to one artifact, declare it in that artifact and update the lockfile; refresh the workspace installation so the artifact has its own link before running its commands. Avoid adding the dependency at the root just to bypass the callback's scope limitation.

Python utility installation can also initialize a root Python project and a
starter program in this Node.js workspace; do not assume the callback only
changes the requested dependency.

**Why:** Installing a PDF inspection dependency generated an unrelated starter
program along with dependency and system-library configuration.

**How to apply:** Inspect the resulting changes. Keep necessary inspection
tooling, remove only confirmed generated starter content, and preserve existing
application entry points and workflow configuration.