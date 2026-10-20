import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const packages = ["api-spec", "api-client-react", "api-zod"];
const contract = `openapi: 3.0.3
info:
  title: Fixture
  version: 1.0.0
paths:
  /probe:
    get:
      operationId: getCodegenProbe
      responses:
        '200':
          description: Fixture response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CodegenProbe'
components:
  schemas:
    CodegenProbe:
      type: object
      required: [transactionProbe]
      properties:
        transactionProbe:
          type: string
`;

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "orval-transaction-"));
  try {
    for (const file of ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json"]) {
      cpSync(path.join(workspace, file), path.join(root, file));
    }
    writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
      files: [],
      references: packages.slice(1).map((pkg) => ({ path: `./lib/${pkg}` })),
    }));
    // Use a real compiler on success, and record that failed generation never
    // reaches it. No application or database packages exist in this fixture.
    const rootPackage = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    rootPackage.scripts["typecheck:libs"] = "node -e \"require('fs').writeFileSync('typecheck-ran', '')\" && tsc --build";
    writeFileSync(path.join(root, "package.json"), JSON.stringify(rootPackage));
    symlinkSync(path.join(workspace, "node_modules"), path.join(root, "node_modules"), "dir");
    for (const pkg of packages) {
      const source = path.join(workspace, "lib", pkg);
      const destination = path.join(root, "lib", pkg);
      mkdirSync(destination, { recursive: true });
      for (const item of pkg === "api-spec"
        ? ["package.json", "orval.config.ts", "codegen.mjs"]
        : ["package.json", "tsconfig.json", "src"]) {
        cpSync(path.join(source, item), path.join(destination, item), { recursive: true });
      }
      symlinkSync(path.join(source, "node_modules"), path.join(destination, "node_modules"), "dir");
      if (pkg !== "api-spec") {
        mkdirSync(path.join(destination, "dist"), { recursive: true });
        writeFileSync(path.join(destination, "dist/previous.d.ts"), "// previous declaration\n");
      }
    }
    writeFileSync(path.join(root, "lib/api-spec/openapi.yaml"), contract);
    return root;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function run(root, command = "pnpm", args = ["--filter", "@workspace/api-spec", "run", "codegen"], env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 120_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stdout + result.stderr);
  return { status: result.status, output: stripVTControlCharacters(result.stdout + result.stderr) };
}

function tree(directory) {
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? Object.entries(tree(file)).map(([name, value]) => [`${entry.name}/${name}`, value])
      : [[entry.name, readFileSync(file).toString("base64")]];
  }));
}

function active(root) {
  return packages.slice(1).map((pkg) => ({
    src: tree(path.join(root, "lib", pkg, "src")),
    dist: tree(path.join(root, "lib", pkg, "dist")),
  }));
}

function assertFailedUnchanged(root, before, result) {
  assert.notEqual(result.status, 0, result.output);
  assert.deepEqual(active(root), before, "both complete source trees and prior declarations must stay unchanged");
  assert.ok(!existsSync(path.join(root, "typecheck-ran")), "do not compile after failed Orval output");
  assert.deepEqual(readdirSync(path.join(root, "lib/api-spec")).filter((name) => name.startsWith(".codegen-")), []);
}

test("real invalid OpenAPI reference fails codegen without changing either active tree", () => {
  const root = fixture();
  try {
    const before = active(root);
    writeFileSync(path.join(root, "lib/api-spec/openapi.yaml"), contract.replace("#/components/schemas/CodegenProbe", "#/components/schemas/MissingSchema"));
    const result = run(root);
    assertFailedUnchanged(root, before, result);
    assert.match(result.output, /MissingSchema/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const failedProject of ["api-client-react", "zod"]) {
  test(`real ${failedProject} output write failure preserves the old pair; retry publishes and compiles both`, () => {
    const root = fixture();
    try {
      const before = active(root);
      const config = path.join(root, "lib/api-spec/orval.config.ts");
      const original = readFileSync(config, "utf8");
      const blocker = path.join(root, "not-a-directory");
      writeFileSync(blocker, "force a real filesystem error in Orval");
      let projectIndex = 0;
      writeFileSync(config, original.replaceAll('target: "generated",', (match) => {
        const project = projectIndex++ === 0 ? "api-client-react" : "zod";
        return project === failedProject ? `target: ${JSON.stringify(path.join(blocker, "api.ts"))},` : match;
      }));
      assert.equal(projectIndex, 2);
      const result = run(root);
      assertFailedUnchanged(root, before, result);
      assert.match(result.output, /ENOTDIR|EEXIST/);
      // Orval continues to the other project even when one project fails.
      // Verify this is genuinely partial generation, not a config load error.
      const otherProject = failedProject === "zod" ? "api-client-react" : "zod";
      assert.match(result.output, new RegExp(`${otherProject} - .*converted into ready to use orval`, "i"));

      writeFileSync(config, original);
      const retried = run(root);
      assert.equal(retried.status, 0, retried.output);
      assert.ok(existsSync(path.join(root, "typecheck-ran")));
      for (const pkg of packages.slice(1)) {
        const generated = tree(path.join(root, "lib", pkg, "src/generated"));
        const text = Object.values(generated).map((value) => Buffer.from(value, "base64").toString()).join("\n");
        assert.match(text, /transactionProbe/);
        assert.doesNotMatch(text, /\.codegen-|orval-transaction-|Regulation/);
        assert.ok(existsSync(path.join(root, "lib", pkg, "dist/generated/api.d.ts")));
        const outsideGenerated = (src) => Object.fromEntries(Object.entries(src).filter(([name]) => !name.startsWith("generated/")));
        assert.deepEqual(outsideGenerated(tree(path.join(root, "lib", pkg, "src"))), outsideGenerated(before[packages.indexOf(pkg) - 1].src));
      }
      assert.deepEqual(readdirSync(path.join(root, "lib/api-spec")).filter((name) => name.startsWith(".codegen-")), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("post-merge propagates a real Orval failure and never reaches database commands", () => {
  const root = fixture();
  try {
    const before = active(root);
    writeFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "openapi: [broken YAML\n");
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    const pnpm = path.join(bin, "pnpm");
    const realPnpm = spawnSync("which", ["pnpm"], { encoding: "utf8" }).stdout.trim();
    assert.ok(realPnpm);
    writeFileSync(pnpm, `#!/bin/bash
printf '%s\\n' "$*" >> "$COMMAND_LOG"
if [[ "$*" == "install --frozen-lockfile" ]]; then exit 0; fi
if [[ "$*" == *"@workspace/db"* ]]; then echo 'Forbidden database command' >&2; exit 99; fi
exec "$REAL_PNPM" "$@"
`);
    chmodSync(pnpm, 0o755);
    const log = path.join(root, "commands.log");
    const result = run(root, "bash", [path.join(workspace, "scripts/post-merge.sh")], {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_PNPM: realPnpm, COMMAND_LOG: log,
    });
    assertFailedUnchanged(root, before, result);
    assert.match(result.output, /YAML|parse|end of the stream/i);
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
      "install --frozen-lockfile",
      "--filter @workspace/api-spec run codegen",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const rollback of [false, true]) {
  test(`concurrent runner cannot cross promotions while the owner ${rollback ? "rolls back" : "publishes"} a different contract`, { timeout: 120_000 }, async () => {
    const root = fixture();
    const gate = path.join(root, "resume");
    const paused = path.join(root, "paused");
    const preload = path.join(root, "pause-promotion.mjs");
    let child;
    let finished;
    try {
      const before = active(root);
      // Only this isolated runner uses the preload. Real Orval still generates
      // both outputs. Pause immediately AFTER the first tree is installed:
      // without serialization another runner could now replace both trees,
      // leaving its client paired with this runner's validator at completion.
      writeFileSync(preload, `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const rename = fs.renameSync;
let installedClient = false;
fs.renameSync = (source, destination) => {
  if (${rollback} && installedClient && source.endsWith("/api-zod/src/generated")) {
    throw new Error("Injected second promotion failure");
  }
  rename(source, destination);
  if (source.includes("/.codegen-") && source.endsWith("/api-client-react/src/generated")) {
    installedClient = true;
    fs.writeFileSync(${JSON.stringify(paused)}, "");
    const deadline = Date.now() + 90_000;
    while (!fs.existsSync(${JSON.stringify(gate)})) {
      if (Date.now() > deadline) throw new Error("Promotion gate timed out");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
};
syncBuiltinESMExports();
`);
      const spec = path.join(root, "lib/api-spec/openapi.yaml");
      writeFileSync(spec, contract.replaceAll("transactionProbe", "firstContractProbe"));
      child = spawn(process.execPath, ["--import", preload, "lib/api-spec/codegen.mjs"], {
        cwd: root, stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      finished = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (status, signal) => resolve({
          status, signal, output: stripVTControlCharacters(output),
        }));
      });
      const deadline = Date.now() + 60_000;
      while (!existsSync(paused)) {
        assert.equal(child.exitCode, null, output);
        assert.ok(Date.now() < deadline, `owner never reached promotion gate\n${output}`);
        await delay(20);
      }

      const duringPromotion = active(root);
      const stageEntries = readdirSync(path.join(root, "lib/api-spec")).filter((name) => name.startsWith(".codegen-")).sort();
      writeFileSync(spec, contract.replaceAll("transactionProbe", "secondContractProbe"));
      const contender = run(root, process.execPath, ["lib/api-spec/codegen.mjs"]);
      assert.notEqual(contender.status, 0, contender.output);
      assert.match(contender.output, /Codegen is already running/);
      assert.deepEqual(active(root), duringPromotion, "contender must not publish or roll back either source");
      assert.deepEqual(
        readdirSync(path.join(root, "lib/api-spec")).filter((name) => name.startsWith(".codegen-")).sort(),
        stageEntries,
        "contender must neither create a stage nor remove the owner's stage/lock",
      );
      assert.ok(existsSync(path.join(root, "lib/api-spec/.codegen-lock")));

      writeFileSync(gate, "");
      const owner = await finished;
      assert.equal(owner.signal, null, owner.output);
      assert.equal(owner.status, rollback ? 1 : 0, owner.output);
      if (rollback) {
        assert.match(owner.output, /Injected second promotion failure/);
        assert.deepEqual(active(root), before, "rollback must restore the complete old pair");
      } else {
        for (const pkg of packages.slice(1)) {
          const text = Object.values(tree(path.join(root, "lib", pkg, "src/generated")))
            .map((value) => Buffer.from(value, "base64").toString()).join("\n");
          assert.match(text, /firstContractProbe/);
          assert.doesNotMatch(text, /secondContractProbe/);
        }
      }
      assert.deepEqual(readdirSync(path.join(root, "lib/api-spec")).filter((name) => name.startsWith(".codegen-")), []);
      // A rejected invocation must be safely retryable after either outcome.
      const retry = run(root, process.execPath, ["lib/api-spec/codegen.mjs"]);
      assert.equal(retry.status, 0, retry.output);
      for (const pkg of packages.slice(1)) {
        const text = Object.values(tree(path.join(root, "lib", pkg, "src/generated")))
          .map((value) => Buffer.from(value, "base64").toString()).join("\n");
        assert.match(text, /secondContractProbe/);
        assert.doesNotMatch(text, /firstContractProbe/);
      }
      assert.deepEqual(readdirSync(path.join(root, "lib/api-spec")).filter((name) => name.startsWith(".codegen-")), []);
    } finally {
      if (child && child.exitCode === null) {
        writeFileSync(gate, "");
        await finished;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
}
