import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.dirname(here);
const require = createRequire(import.meta.url);
const lock = path.join(here, ".codegen-lock");
let ownsLock = false;
let lockFd;
let stage;
const packages = ["api-client-react", "api-zod"];
let preserveStage = false;

function journal(directory, transaction) {
  const target = path.join(directory, "transaction.json");
  writeFileSync(`${target}.tmp`, JSON.stringify(transaction));
  renameSync(`${target}.tmp`, target);
}

function recover(directory) {
  if (!existsSync(directory)) return;
  if (directory.endsWith(".cleanup")) {
    rmSync(directory, { recursive: true, force: true });
    return;
  }
  const target = path.join(directory, "transaction.json");
  // No journal means generation had not started publishing any output.
  if (existsSync(target)) {
    const transaction = JSON.parse(readFileSync(target, "utf8"));
    if (transaction.version !== 1 || !["publishing", "complete"].includes(transaction.state)
      || !Array.isArray(transaction.previous) || transaction.previous.length !== packages.length
      || transaction.previous.some((value) => typeof value !== "boolean")) {
      throw new Error(`Invalid codegen recovery journal at ${target}; retained for manual recovery`);
    }
    if (transaction.state === "publishing") {
      for (const [index, pkg] of packages.entries()) {
        const destination = path.join(lib, pkg, "src/generated");
        const backup = path.join(directory, `${pkg}.backup`);
        if (transaction.previous[index]) {
          if (!existsSync(backup)) {
            // The backup rename has not happened yet; this is still the old tree.
            if (!existsSync(destination)) throw new Error(`Missing codegen recovery source for ${pkg}`);
            continue;
          }
          // Keep the backup intact until the entire rollback is recorded.
          // Recovery itself can be killed between any of these operations.
          const restoring = path.join(directory, `${pkg}.restoring`);
          rmSync(restoring, { recursive: true, force: true });
          cpSync(backup, restoring, { recursive: true });
          rmSync(destination, { recursive: true, force: true });
          renameSync(restoring, destination);
        } else {
          rmSync(destination, { recursive: true, force: true });
        }
      }
      journal(directory, { ...transaction, state: "complete" });
    }
  } else if (packages.some((pkg) => existsSync(path.join(directory, `${pkg}.backup`)))) {
    throw new Error(`Codegen backups without a recovery journal at ${directory}; retained for manual recovery`);
  }
  // Recursive deletion can itself be interrupted after removing the journal.
  // A renamed cleanup directory is unambiguously disposable on the next run.
  const garbage = `${directory}.cleanup`;
  renameSync(directory, garbage);
  rmSync(garbage, { recursive: true, force: true });
}

try {
  // flock shares the inherited open file description with this process. The
  // kernel releases it even on SIGKILL. Never unlink this stable mutex inode:
  // doing so could let concurrent runners lock different files.
  lockFd = openSync(path.join(here, ".codegen.lock"), "a");
  const locked = spawnSync("flock", ["--nonblock", "3"], {
    stdio: ["ignore", "inherit", "inherit", lockFd],
  });
  if (locked.error) throw locked.error;
  if (locked.status !== 0) {
    throw new Error("Codegen is already running or the system lock is unavailable; active sources were not changed");
  }
  ownsLock = true;
  // All recovery runs under the same mutex as generation and publication.
  for (const name of readdirSync(here).sort()) {
    if (name.startsWith(".codegen-") && name !== ".codegen-lock") {
      recover(path.join(here, name));
    }
  }
  rmSync(lock, { recursive: true, force: true });
  mkdirSync(lock);
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

  // Write intent BEFORE the first rename, and retain backups until a durable
  // completion marker exists. This protects process interruption, not power
  // loss, nor atomic multi-directory visibility to watchers.
  const transaction = {
    version: 1,
    state: "publishing",
    previous: packages.map((pkg) => existsSync(path.join(lib, pkg, "src/generated"))),
  };
  journal(stage, transaction);
  for (const [index, pkg] of packages.entries()) {
    const destination = path.join(lib, pkg, "src/generated");
    const backup = path.join(stage, `${pkg}.backup`);
    if (transaction.previous[index]) renameSync(destination, backup);
    renameSync(path.join(stage, pkg, "src/generated"), destination);
  }
  journal(stage, { ...transaction, state: "complete" });
} catch (error) {
  if (stage) {
    try {
      recover(stage);
    } catch (rollbackError) {
      preserveStage = true;
      console.error(`Codegen rollback failed; backups retained at ${stage}`, rollbackError);
    }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (stage && !preserveStage) recover(stage);
  } finally {
    if (ownsLock) rmSync(lock, { recursive: true, force: true });
    if (lockFd !== undefined) closeSync(lockFd);
  }
}
