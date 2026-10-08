import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
const libraries = ["db", "api-zod", "integrations-openai-ai-server"];
const packages = [...libraries.map((lib) => `lib/${lib}`), "artifacts/api-server"];

// Copy sources, never dist or build metadata. Workspace imports must resolve to
// the fixture too, otherwise the real checkout's declarations could hide a bug.
function cleanWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), "api-typecheck-"));
  try {
    for (const file of ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json"]) {
      cpSync(path.join(workspace, file), path.join(root, file));
    }
    symlinkSync(path.join(workspace, "node_modules"), path.join(root, "node_modules"), "dir");
    for (const pkg of packages) {
      const target = path.join(root, pkg);
      mkdirSync(target, { recursive: true });
      for (const item of ["package.json", "tsconfig.json", "src"]) {
        cpSync(path.join(workspace, pkg, item), path.join(target, item), { recursive: true });
      }
      const modules = path.join(target, "node_modules");
      mkdirSync(modules);
      for (const entry of readdirSync(path.join(workspace, pkg, "node_modules"))) {
        if (entry === "@workspace") continue;
        symlinkSync(path.join(workspace, pkg, "node_modules", entry), path.join(modules, entry), "dir");
      }
      mkdirSync(path.join(modules, "@workspace"));
      for (const lib of libraries) {
        symlinkSync(path.join(root, "lib", lib), path.join(modules, "@workspace", lib), "dir");
      }
    }
    return root;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function check(root) {
  const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "typecheck"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

function assertPassed(result) {
  assert.equal(result.status, 0, result.output);
}

test("API typecheck builds references from clean sources and refreshes stale declarations without emitting API code", () => {
  const root = cleanWorkspace();
  try {
    assertPassed(check(root));
    for (const lib of libraries) {
      assert.ok(existsSync(path.join(root, "lib", lib, "dist/index.d.ts")));
    }
    assert.ok(!existsSync(path.join(root, "artifacts/api-server/dist")), "API typecheck must not emit application code");

    // Leave the first build's declaration files in place, then add exports to
    // both libraries and consume them from the API. A leaf-only check fails here.
    for (const lib of ["db", "api-zod"]) {
      const file = path.join(root, "lib", lib, "src/index.ts");
      writeFileSync(file, readFileSync(file, "utf8") + "\nexport type FreshTypecheckExport = { fresh: true };\n");
    }
    const probe = path.join(root, "artifacts/api-server/src/typecheck-probe.ts");
    writeFileSync(probe, [
      'import type { FreshTypecheckExport as Db } from "@workspace/db";',
      'import type { FreshTypecheckExport as Api } from "@workspace/api-zod";',
      "export const db: Db = { fresh: true };",
      "export const api: Api = { fresh: true };",
    ].join("\n"));
    assertPassed(check(root));
    assertPassed(check(root)); // Incremental repeat must also succeed.
    assert.ok(!existsSync(path.join(root, "artifacts/api-server/dist")));

    writeFileSync(probe, "export const invalid: string = 123;\n");
    const apiError = check(root);
    assert.notEqual(apiError.status, 0, apiError.output);
    assert.match(apiError.output, /typecheck-probe\.ts.*TS2322/);
    rmSync(probe);
    writeFileSync(path.join(root, "lib/db/src/typecheck-probe.ts"), "export const invalid: string = 123;\n");
    const libError = check(root);
    assert.notEqual(libError.status, 0, libError.output);
    assert.match(libError.output, /typecheck-probe\.ts.*TS2322/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});