---
name: Workspace package installation
description: Handling a dependency needed by only one package when the package installer targets the workspace root.
---

The language-package installation callback runs a root-level pnpm add and cannot target a workspace package directly.

**Why:** A scoped frontend test dependency was declared but its import still failed after updating only the lockfile; the package symlink was not created until the offline install refreshed links. A callback attempt to add the package failed with pnpm's workspace-root guard.

**How to apply:** When a dependency belongs to one artifact, declare it in that artifact and update the lockfile; refresh the workspace installation so the artifact has its own link before running its commands. Avoid adding the dependency at the root just to bypass the callback's scope limitation.