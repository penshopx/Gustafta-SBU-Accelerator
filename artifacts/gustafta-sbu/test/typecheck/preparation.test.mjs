import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
const libraries = ["api-client-react", "api-zod", "db", "integrations-openai-ai-server"];
const packages = [...libraries.map((name) => `lib/${name}`), "lib/api-spec", "artifacts/gustafta-sbu", "artifacts/api-server"];

// Resolve workspace imports inside the fixture, not to the live checkout.
// Neither declaration output nor incremental metadata is copied.
function cleanWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), "frontend-typecheck-"));
  try {
    for (const file of ["package.json", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json"]) {
      cpSync(path.join(workspace, file), path.join(root, file));
    }
    symlinkSync(path.join(workspace, "node_modules"), path.join(root, "node_modules"), "dir");
    for (const pkg of packages) {
      const target = path.join(root, pkg);
      mkdirSync(target, { recursive: true });
      for (const item of ["package.json", "tsconfig.json", "src", "openapi.yaml", "orval.config.ts"]) {
        const source = path.join(workspace, pkg, item);
        if (existsSync(source)) cpSync(source, path.join(target, item), { recursive: true });
      }
      const modules = path.join(target, "node_modules");
      mkdirSync(modules);
      for (const entry of readdirSync(path.join(workspace, pkg, "node_modules"))) {
        if (entry !== "@workspace") {
          symlinkSync(path.join(workspace, pkg, "node_modules", entry), path.join(modules, entry), "dir");
        }
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

function run(root, command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 120_000, ...options });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

function check(root) {
  return run(root, "pnpm", ["--filter", "@workspace/gustafta-sbu", "run", "typecheck"]);
}

function assertPassed(result) {
  assert.equal(result.status, 0, result.output);
}

test("frontend typecheck handles stale declarations and regenerated contract changes, while preserving real type errors", () => {
  const root = cleanWorkspace();
  try {
    assertPassed(check(root));
    const declaration = path.join(root, "lib/api-client-react/dist/generated/api.schemas.d.ts");
    const current = readFileSync(declaration, "utf8");
    assert.match(current, /transitionFindings: Finding\[\];/);
    // Corrupt only the emitted contract, leaving sources and build metadata
    // unchanged: an incremental build alone would consider this up to date.
    writeFileSync(declaration, current.replace("transitionFindings: Finding[];", ""));
    const unprepared = run(root, "pnpm", ["exec", "tsc", "-p", "tsconfig.json", "--noEmit"], {
      cwd: path.join(root, "artifacts/gustafta-sbu"),
    });
    assert.notEqual(unprepared.status, 0, unprepared.output);
    assert.match(unprepared.output, /transitionFindings/);
    assertPassed(check(root));
    assert.match(readFileSync(declaration, "utf8"), /transitionFindings: Finding\[\];/);
    assertPassed(check(root));
    assert.ok(!existsSync(path.join(root, "artifacts/gustafta-sbu/dist")));

    // Change only the fixture contract, with existing output/build metadata in
    // place. A frontend consumer must fail until codegen propagates this field.
    const spec = path.join(root, "lib/api-spec/openapi.yaml");
    const originalSpec = readFileSync(spec, "utf8");
    const regulationProperties = "    Regulation:\n      type: object\n      required: [id, title, detail, source, effectiveStatus, transitionFindings]\n      properties:\n";
    assert.ok(originalSpec.includes(regulationProperties), "Regulation fixture anchor must exist");
    assert.ok(!originalSpec.includes("typecheckContractProbe"), "Probe must be new to the contract");
    writeFileSync(spec, originalSpec.replace(
      regulationProperties,
      `${regulationProperties}        typecheckContractProbe: { type: string }\n`,
    ));
    const clientSource = path.join(root, "lib/api-client-react/src/generated/api.schemas.ts");
    const zodSource = path.join(root, "lib/api-zod/src/generated/api.ts");
    for (const file of [clientSource, declaration, zodSource]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /typecheckContractProbe/);
    }
    const contractProbe = path.join(root, "artifacts/gustafta-sbu/src/contract-probe.ts");
    const consumer = [
      'import type { Regulation } from "@workspace/api-client-react";',
      'export const contractProbe: NonNullable<Regulation["typecheckContractProbe"]> = "fixture-only";',
      "export const readContractProbe = (regulation: Regulation): string | undefined => regulation.typecheckContractProbe;",
      "",
    ].join("\n");
    writeFileSync(contractProbe, consumer);
    const beforeCodegen = check(root);
    assert.notEqual(beforeCodegen.status, 0, beforeCodegen.output);
    assert.match(beforeCodegen.output, /contract-probe\.ts.*TS2339.*typecheckContractProbe/);

    // Codegen must propagate the new contract AND replace a stale declaration
    // despite otherwise valid build metadata.
    writeFileSync(declaration, current.replace("transitionFindings: Finding[];", ""));
    assertPassed(run(root, "pnpm", ["--filter", "@workspace/api-spec", "run", "codegen"]));
    assert.match(readFileSync(declaration, "utf8"), /transitionFindings: Finding\[\];/);
    for (const file of [clientSource, declaration]) {
      assert.match(readFileSync(file, "utf8"), /typecheckContractProbe\?: string;/);
    }
    assert.match(readFileSync(zodSource, "utf8"), /"typecheckContractProbe": zod\.string\(\)\.optional\(\)/);
    assertPassed(run(root, "node", ["--import", "tsx", "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { ListRegulationsResponseItem } from "../../lib/api-zod/src/generated/api.ts";
      const field = ListRegulationsResponseItem.shape.typecheckContractProbe;
      assert.equal(field.parse("fixture-only"), "fixture-only");
      assert.equal(field.parse(undefined), undefined);
      assert.equal(field.safeParse(123).success, false);
    `], { cwd: path.join(root, "artifacts/gustafta-sbu") }));
    assertPassed(check(root));
    writeFileSync(contractProbe, `${consumer}export const invalidContractProbe: NonNullable<Regulation["typecheckContractProbe"]> = 123;\n`);
    const wrongContractType = check(root);
    assert.notEqual(wrongContractType.status, 0, wrongContractType.output);
    assert.match(wrongContractType.output, /contract-probe\.ts.*TS2322/);
    writeFileSync(contractProbe, consumer);

    const frontendProbe = path.join(root, "artifacts/gustafta-sbu/src/typecheck-probe.ts");
    writeFileSync(frontendProbe, "export const invalid: string = 123;\n");
    const frontendError = check(root);
    assert.notEqual(frontendError.status, 0, frontendError.output);
    assert.match(frontendError.output, /typecheck-probe\.ts.*TS2322/);
    rmSync(frontendProbe);
    writeFileSync(path.join(root, "lib/api-client-react/src/typecheck-probe.ts"), "export const invalid: string = 123;\n");
    const libError = check(root);
    assert.notEqual(libError.status, 0, libError.output);
    assert.match(libError.output, /typecheck-probe\.ts.*TS2322/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post-merge prepares API declarations after install and fails fast before existing database steps", () => {
  const root = mkdtempSync(path.join(tmpdir(), "post-merge-order-"));
  try {
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    const log = path.join(root, "commands.log");
    const pnpm = path.join(bin, "pnpm");
    writeFileSync(pnpm, '#!/bin/bash\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nif [[ "$*" == "--filter @workspace/api-spec run codegen" && "${FAIL_CODEGEN:-}" == "1" ]]; then exit 42; fi\n');
    chmodSync(pnpm, 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: log };
    const script = path.join(workspace, "scripts/post-merge.sh");
    const commands = [
      "install --frozen-lockfile",
      "--filter @workspace/api-spec run codegen",
      "--filter @workspace/db run push",
      "--filter @workspace/db run migrate:workspace",
    ];
    assertPassed(run(root, "bash", [script], { env }));
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), commands);
    writeFileSync(log, "");
    const failed = run(root, "bash", [script], { env: { ...env, FAIL_CODEGEN: "1" } });
    assert.equal(failed.status, 42, failed.output);
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), commands.slice(0, 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
