// fixture:storage
var ObjectNotFoundError = class extends Error {
};
var ObjectStorageService = class {
  getPrivateObjectDir() {
    return "/synthetic-bucket/private";
  }
};
var objectStorageClient = { bucket: () => globalThis.__cleanupBucket };

// fixture:acl
var setObjectAclPolicy = async () => {
};

// src/lib/document-validation.ts
import { PDFDocument } from "pdf-lib";
var MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
var DOCUMENT_COMPLETION_WINDOW_MS = 30 * 6e4;
var DOCUMENT_CLEANUP_GRACE_MS = 48 * 60 * 6e4;
var DocumentValidationError = class extends Error {
};
function validDocumentSignature(bytes, contentType) {
  if (contentType === "application/pdf") return Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  if (contentType === "image/png") return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return false;
}
async function validateDocumentBytes(bytes, contentType) {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES || !validDocumentSignature(bytes, contentType)) {
    throw new DocumentValidationError();
  }
  if (contentType !== "application/pdf") return;
  try {
    const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1");
    if (!/%%EOF[\s\0]*$/.test(tail)) throw new DocumentValidationError();
    const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
    if (pdf.getPageCount() < 1) throw new DocumentValidationError();
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new DocumentValidationError();
      }
    }
  } catch {
    throw new DocumentValidationError();
  }
}

// src/lib/document-cleanup.ts
var managedPath = /^\/objects\/(uploads|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function isManagedDocumentPath(path) {
  return managedPath.test(path);
}

// src/lib/document-malware.ts
import { spawn } from "node:child_process";
import { mkdtemp, access, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
var SCAN_DATABASE = resolve(".cache/clamav");
var SCAN_TIMEOUT_MS = 36e4;
var MEMORY_BYTES = 2 * 1024 ** 3;
function limitedProcess(command, args, wallMs, cpuSeconds) {
  return new Promise((done) => {
    const child = spawn("prlimit", [
      `--as=${MEMORY_BYTES}`,
      `--cpu=${cpuSeconds}`,
      "--fsize=536870912",
      "--nofile=128",
      "--core=0",
      "--",
      command,
      ...args
    ], { stdio: "ignore", detached: true });
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(code);
    };
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, wallMs);
    child.once("error", () => finish(null));
    child.once("close", (code, signal) => finish(signal ? null : code));
  });
}
function createLocalScanner({
  database = SCAN_DATABASE,
  run = limitedProcess,
  wallMs = SCAN_TIMEOUT_MS,
  requireOfficialDatabase = true
} = {}) {
  let active = false;
  return async (bytes) => {
    if (active || !bytes.length || bytes.length > MAX_DOCUMENT_BYTES) return "error";
    active = true;
    let directory;
    try {
      if (requireOfficialDatabase) {
        await Promise.all(["main", "daily"].map(async (name) => {
          try {
            await access(join(database, `${name}.cvd`));
          } catch {
            await access(join(database, `${name}.cld`));
          }
        }));
      }
      directory = await mkdtemp(join(tmpdir(), "sbu-scan-"));
      const input = join(directory, "document");
      await writeFile(input, bytes, { mode: 384, flag: "wx" });
      const code = await run("clamscan", [
        `--database=${database}`,
        "--fail-if-cvd-older-than=7",
        "--no-summary",
        `--tempdir=${directory}`,
        "--bytecode-unsigned=no",
        "--max-filesize=21M",
        "--max-scansize=100M",
        "--max-files=1000",
        "--max-recursion=16",
        "--alert-exceeds-max=yes",
        "--alert-encrypted=yes",
        "--alert-broken=yes",
        "--alert-broken-media=yes",
        "--alert-macros=yes",
        input
      ], wallMs, 240);
      return code === 0 ? "clean" : code === 1 ? "infected" : "error";
    } catch {
      return "error";
    } finally {
      active = false;
      if (directory) {
        try {
          await rm(directory, { recursive: true, force: true });
        } catch {
          return "error";
        }
      }
    }
  };
}
var scanDocument = createLocalScanner();

// src/lib/document-storage.ts
var storage = new ObjectStorageService();
var scanReadActive = false;
function cleanupBucket() {
  const parts = storage.getPrivateObjectDir().replace(/^\/|\/$/g, "").split("/");
  return { bucket: objectStorageClient.bucket(parts[0]), prefix: `${parts.slice(1).join("/")}/` };
}
function cleanupSnapshot(path, metadata) {
  return {
    path,
    generation: metadata.generation === void 0 ? "" : String(metadata.generation),
    updatedAt: Math.max(Date.parse(metadata.updated ?? ""), Date.parse(metadata.timeCreated ?? ""))
  };
}
var documentStorage = {
  // Restrict GC to the two application-owned UUID namespaces, never the bucket
  // root/public assets. GCS pagination is bounded and continued next tick.
  async listCleanupObjects(cursor) {
    const { bucket, prefix } = cleanupBucket();
    const [files, next] = await bucket.getFiles({
      prefix: `${prefix}${cursor.namespace}/`,
      autoPaginate: false,
      maxResults: 1e3,
      pageToken: cursor.pageToken
    });
    const objects = files.map((file) => cleanupSnapshot(`/objects/${file.name.slice(prefix.length)}`, file.metadata)).filter((object) => isManagedDocumentPath(object.path));
    const nextCursor = next?.pageToken ? { namespace: cursor.namespace, pageToken: next.pageToken } : { namespace: cursor.namespace === "uploads" ? "documents" : "uploads" };
    return { objects, nextCursor };
  },
  async inspect(path) {
    if (!isManagedDocumentPath(path)) throw new Error("Unmanaged cleanup path");
    const { bucket, prefix } = cleanupBucket();
    try {
      const [metadata] = await bucket.file(`${prefix}${path.slice("/objects/".length)}`).getMetadata();
      return cleanupSnapshot(path, metadata);
    } catch (error) {
      if (error.code === 404) return void 0;
      throw error;
    }
  },
  async removeGeneration(object) {
    if (!isManagedDocumentPath(object.path) || !object.generation) throw new Error("Unsafe cleanup object");
    const { bucket, prefix } = cleanupBucket();
    try {
      await bucket.file(`${prefix}${object.path.slice("/objects/".length)}`).delete({
        ifGenerationMatch: object.generation
      });
      return true;
    } catch (error) {
      if (error.code === 404) return true;
      if (error.code === 412) return false;
      throw error;
    }
  },
  async reserve() {
    const uploadURL = await storage.getObjectEntityUploadURL();
    return { uploadURL, objectPath: storage.normalizeObjectEntityPath(uploadURL) };
  },
  async seal(objectPath, id, ownerId, contentType, size) {
    const source = await storage.getObjectEntityFile(objectPath);
    const [metadata] = await source.getMetadata();
    if (Number(metadata.size) !== size || metadata.contentType !== contentType || metadata.contentEncoding || size > MAX_DOCUMENT_BYTES) {
      throw new DocumentValidationError();
    }
    const pinned = source.bucket.file(source.name, { generation: metadata.generation });
    const [head] = await pinned.download({ start: 0, end: 11 });
    if (!validDocumentSignature(head, contentType)) throw new DocumentValidationError();
    if (contentType === "application/pdf") {
      const [bytes] = await pinned.download();
      await validateDocumentBytes(bytes, contentType);
    }
    const privateDir = storage.getPrivateObjectDir();
    const parts = privateDir.replace(/^\/|\/$/g, "").split("/");
    const destination = objectStorageClient.bucket(parts[0]).file(`${parts.slice(1).join("/")}/documents/${id}`);
    await pinned.copy(destination, { preconditionOpts: { ifGenerationMatch: 0 } });
    try {
      await setObjectAclPolicy(destination, { owner: ownerId, visibility: "private" });
    } catch (error) {
      await destination.delete({ ignoreNotFound: true }).catch(() => {
      });
      throw error;
    }
    return `/objects/documents/${id}`;
  },
  async remove(objectPath) {
    try {
      const file = await storage.getObjectEntityFile(objectPath);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  },
  async scan(objectPath, expectedSize) {
    if (scanReadActive) return { verdict: "error", generation: null };
    scanReadActive = true;
    try {
      const source = await storage.getObjectEntityFile(objectPath);
      const [metadata] = await source.getMetadata();
      if (!metadata.generation || Number(metadata.size) !== expectedSize || expectedSize > MAX_DOCUMENT_BYTES) {
        return { verdict: "error", generation: null };
      }
      const file = source.bucket.file(source.name, { generation: metadata.generation });
      const stream = file.createReadStream();
      const timer = setTimeout(() => stream.destroy(new Error("Scan read timeout")), 1e4);
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > expectedSize) throw new Error("Scan size exceeded");
          chunks.push(Buffer.from(chunk));
        }
      } finally {
        clearTimeout(timer);
        stream.destroy();
      }
      if (size !== expectedSize) return { verdict: "error", generation: null };
      const verdict = await scanDocument(Buffer.concat(chunks));
      return { verdict, generation: String(metadata.generation) };
    } catch {
      return { verdict: "error", generation: null };
    } finally {
      scanReadActive = false;
    }
  },
  async file(objectPath, generation) {
    const file = await storage.getObjectEntityFile(objectPath);
    return generation ? file.bucket.file(file.name, { generation }) : file;
  }
};
export {
  DocumentValidationError,
  MAX_DOCUMENT_BYTES,
  documentStorage,
  validDocumentSignature
};
