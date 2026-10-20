import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.dirname(here);
const require = createRequire(import.meta.url);
const lock = path.join(here, ".codegen-lock");
let ownsLock = false;
let stage;
const packages = ["api-client-react", "api-zod"];
const published = [];
let preserveStage = false;

try {
  // Fail closed rather than wait or reclaim a possibly live lock. Keep this
  // lock through generation, BOTH promotions, rollback, and stage cleanup.
  // Never unlink another runner's lock (including after an EEXIST failure).
  try {
    mkdirSync(lock);
    ownsLock = true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`Codegen is already running or its lock was retained at ${lock}; active sources were not changed`);
  }
  stage = mkdtempSync(path.join(here, ".codegen-"));

  // Preserve the mutator's relative location so generated imports remain valid
  // when only the generated directories are moved to their final destinations.
  const clientSrc = path.join(stage, "api-client-react/src");
  mkdirSync(clientSrc, { recursive: true });
  cpSync(path.join(lib, "api-client-react/src/custom-fetch.ts"), path.join(clientSrc, "custom-fetch.ts"));

  const result = spawnSync(process.execPath, [require.resolve("orval/bin/orval"), "--config", "./orval.config.ts"], {
    cwd: here,
    env: { ...process.env, API_CODEGEN_STAGE_ROOT: stage },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Orval failed (${result.signal ?? result.status}); active sources were not changed`);
  }

  // A successful exit alone is insufficient if a config accidentally omits an
  // output that our package barrels require.
  for (const [pkg, files] of [
    ["api-client-react", ["api.ts", "api.schemas.ts"]],
    ["api-zod", ["api.ts", "types/index.ts"]],
  ]) {
    for (const file of files) {
      const generated = path.join(stage, pkg, "src/generated", file);
      if (!statSync(generated).isFile() || statSync(generated).size === 0) {
        throw new Error(`Missing generated output: ${pkg}/${file}`);
      }
    }
  }

  // Keep backups until BOTH renames succeed. This is a transaction at command
  // completion, serialized against other runners, not a claim of atomic
  // multi-directory visibility to watchers.
  for (const pkg of packages) {
    const destination = path.join(lib, pkg, "src/generated");
    const backup = path.join(stage, `${pkg}.backup`);
    const entry = { destination, backup, hadPrevious: existsSync(destination), installed: false };
    if (entry.hadPrevious) renameSync(destination, backup);
    published.push(entry);
    renameSync(path.join(stage, pkg, "src/generated"), destination);
    entry.installed = true;
  }
} catch (error) {
  const rollbackErrors = [];
  for (const entry of published.reverse()) {
    try {
      if (entry.installed) rmSync(entry.destination, { recursive: true, force: true });
      if (entry.hadPrevious) renameSync(entry.backup, entry.destination);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
  }
  if (rollbackErrors.length) {
    preserveStage = true;
    console.error(`Codegen rollback failed; backups retained at ${stage}`, rollbackErrors);
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (stage && !preserveStage) rmSync(stage, { recursive: true, force: true });
  } finally {
    if (ownsLock) rmSync(lock, { recursive: true });
  }
}
