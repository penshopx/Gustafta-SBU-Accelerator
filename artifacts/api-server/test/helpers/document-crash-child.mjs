// Test-only process entry point. Bundled with the real SBU routes and GC job.
// Configuration contains only the disposable restricted login, never the app login.
import pg from "pg";
import { appendFile, copyFile, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const config = await new Promise(resolve => process.once("message", resolve));
export const pool = new pg.Pool(config.database);
const event = type => process.send({ type });
const hold = async type => {
  event(type);
  await new Promise(() => {});
};
// Unlike crash holds, these barriers let a concurrent request finish after
// the parent has inspected the real PostgreSQL lock and visibility state.
const barrier = async type => {
  await new Promise(resolve => {
    const release = message => {
      if (message.type !== `release-${type}`) return;
      process.off("message", release);
      resolve();
    };
    process.on("message", release);
    event(type);
  });
};
// Let PostgreSQL execute the clean UPDATE, but never let Drizzle reach COMMIT.
// Killing this process must roll the update back, not merely throw a JS error.
pool.on("connect", client => {
  const query = client.query.bind(client);
  client.query = (...args) => {
    const text = typeof args[0] === "string" ? args[0] : args[0].text;
    const result = query(...args);
    if (config.crashAt === "scan-update-held" &&
        /^update "sbu_documents" set "scan_status"/i.test(text)) {
      return result.then(async value => { await hold("scan-update-held"); return value; });
    }
    if (config.pauseScan &&
        /^update "sbu_documents" set "scan_status"/i.test(text)) {
      return result.then(async value => { await barrier("scan-update-held"); return value; });
    }
    return result;
  };
});

const log = async (op, path, generation) =>
  appendFile(join(config.objects, "calls.jsonl"), JSON.stringify({ op, path, generation }) + "\n");
const disk = path => {
  if (!/^\/objects\/(?:uploads|documents)\/[0-9a-f-]{36}$/.test(path)) throw new Error("Non-fixture path");
  return join(config.objects, path.replaceAll("/", "_"));
};
export class DocumentValidationError extends Error {}
export class InvalidCleanupCursor extends Error {}
export const documentStorage = {
  async reserve() {
    const objectPath = `/objects/uploads/${randomUUID()}`;
    await writeFile(disk(objectPath), Buffer.from(config.bytes));
    await log("reserve", objectPath);
    return { objectPath, uploadURL: "https://invalid.test/synthetic-upload" };
  },
  async seal(path, id) {
    await log("seal", path);
    const target = `/objects/documents/${id}`;
    await copyFile(disk(path), disk(target));
    return target;
  },
  async remove(path) { await log("remove", path); await rm(disk(path), { force: true }); },
  async scan(path) {
    await log("scan", path);
    await readFile(disk(path)); // fail if the original was lost during restart/GC
    if (config.crashAt === "scan-held") await hold("scan-held");
    if (config.pauseScan) await barrier("scan-held");
    return { verdict: config.verdict, generation: "123" };
  },
  async file(path, generation) {
    await log("file", path, generation);
    const bytes = await readFile(disk(path));
    return {
      getMetadata: async () => [{ size: String(bytes.length), contentType: "application/pdf" }],
      download: async () => [bytes],
      createReadStream: () => createReadStream(disk(path)),
    };
  },
  async listCleanupObjects() {
    const objects = [];
    for (const name of await readdir(config.objects)) {
      if (!name.startsWith("_objects_")) continue;
      const path = name.replaceAll("_", "/");
      await stat(disk(path));
      // Model old provider metadata, not just old rows: GC must be allowed
      // to delete this object were its ready reference ever lost.
      objects.push({ path, generation: "123", updatedAt: Date.now() - 72 * 60 * 60_000 });
    }
    return { objects, nextCursor: { namespace: "uploads" } };
  },
  async inspect(path) {
    try { await stat(disk(path)); }
    catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
    return { path, generation: "123", updatedAt: Date.now() - 72 * 60 * 60_000 };
  },
  async removeGeneration(object) {
    await log("gc-remove", object.path);
    await rm(disk(object.path), { force: true });
    return true;
  },
};
export const generate = async () => {
  await log("ai");
  throw new Error("Quarantined bytes must not reach AI");
};

