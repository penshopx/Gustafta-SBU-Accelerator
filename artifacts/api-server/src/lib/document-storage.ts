import { ObjectNotFoundError, ObjectStorageService, objectStorageClient } from "./objectStorage";
import { setObjectAclPolicy } from "./objectAcl";
import { DocumentValidationError, MAX_DOCUMENT_BYTES, validateDocumentBytes, validDocumentSignature } from "./document-validation";
import { isManagedDocumentPath, type CleanupObject } from "./document-cleanup";
import { scanDocument } from "./document-malware";

const storage = new ObjectStorageService();
let scanReadActive = false;
function cleanupBucket() {
  const parts = storage.getPrivateObjectDir().replace(/^\/|\/$/g, "").split("/");
  return { bucket: objectStorageClient.bucket(parts[0]), prefix: `${parts.slice(1).join("/")}/` };
}
function cleanupSnapshot(path: string, metadata: { generation?: string | number; updated?: string; timeCreated?: string }): CleanupObject {
  return { path, generation: metadata.generation === undefined ? "" : String(metadata.generation),
    updatedAt: Math.max(Date.parse(metadata.updated ?? ""), Date.parse(metadata.timeCreated ?? "")) };
}
export interface CleanupCursor { namespace: "uploads" | "documents"; pageToken?: string }
export { DocumentValidationError, MAX_DOCUMENT_BYTES, validDocumentSignature } from "./document-validation";
export const documentStorage = {
  // Restrict GC to the two application-owned UUID namespaces, never the bucket
  // root/public assets. GCS pagination is bounded and continued next tick.
  async listCleanupObjects(cursor: CleanupCursor) {
    const { bucket, prefix } = cleanupBucket();
    const [files, next] = await bucket.getFiles({
      prefix: `${prefix}${cursor.namespace}/`, autoPaginate: false, maxResults: 1000, pageToken: cursor.pageToken,
    });
    const objects = files.map((file) => cleanupSnapshot(`/objects/${file.name.slice(prefix.length)}`, file.metadata))
      .filter((object) => isManagedDocumentPath(object.path));
    const nextCursor: CleanupCursor = next?.pageToken
      ? { namespace: cursor.namespace, pageToken: next.pageToken }
      : { namespace: cursor.namespace === "uploads" ? "documents" : "uploads" };
    return { objects, nextCursor };
  },
  async inspect(path: string): Promise<CleanupObject | undefined> {
    if (!isManagedDocumentPath(path)) throw new Error("Unmanaged cleanup path");
    const { bucket, prefix } = cleanupBucket();
    try {
      const [metadata] = await bucket.file(`${prefix}${path.slice("/objects/".length)}`).getMetadata();
      return cleanupSnapshot(path, metadata);
    } catch (error) {
      if ((error as { code?: number }).code === 404) return undefined;
      throw error;
    }
  },
  async removeGeneration(object: CleanupObject) {
    if (!isManagedDocumentPath(object.path) || !object.generation) throw new Error("Unsafe cleanup object");
    const { bucket, prefix } = cleanupBucket();
    try {
      await bucket.file(`${prefix}${object.path.slice("/objects/".length)}`).delete({
        ifGenerationMatch: object.generation,
      });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 404) return true;
      if ((error as { code?: number }).code === 412) return false;
      throw error;
    }
  },
  async reserve() {
    const uploadURL = await storage.getObjectEntityUploadURL();
    return { uploadURL, objectPath: storage.normalizeObjectEntityPath(uploadURL) };
  },
  async seal(objectPath: string, id: string, ownerId: string, contentType: string, size: number) {
    const source = await storage.getObjectEntityFile(objectPath);
    const [metadata] = await source.getMetadata();
    if (Number(metadata.size) !== size || metadata.contentType !== contentType || metadata.contentEncoding || size > MAX_DOCUMENT_BYTES) {
      throw new DocumentValidationError();
    }
    // Pin the source generation: an upload URL can still be reused until expiry.
    // Copy into a NEW private object that was never given a client PUT URL.
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
      await destination.delete({ ignoreNotFound: true }).catch(() => {});
      throw error;
    }
    return `/objects/documents/${id}`;
  },
  async remove(objectPath: string) {
    try {
      const file = await storage.getObjectEntityFile(objectPath);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  },
  async scan(objectPath: string, expectedSize: number) {
    // Bound the complete read+scan path, not only the native subprocess.
    if (scanReadActive) return { verdict: "error" as const, generation: null };
    scanReadActive = true;
    try {
      const source = await storage.getObjectEntityFile(objectPath);
      const [metadata] = await source.getMetadata();
      if (!metadata.generation || Number(metadata.size) !== expectedSize || expectedSize > MAX_DOCUMENT_BYTES) {
        return { verdict: "error" as const, generation: null };
      }
      const file = source.bucket.file(source.name, { generation: metadata.generation });
      const stream = file.createReadStream();
      const timer = setTimeout(() => stream.destroy(new Error("Scan read timeout")), 10_000);
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > expectedSize) throw new Error("Scan size exceeded");
          chunks.push(Buffer.from(chunk));
        }
      } finally { clearTimeout(timer); stream.destroy(); }
      if (size !== expectedSize) return { verdict: "error" as const, generation: null };
      const verdict = await scanDocument(Buffer.concat(chunks));
      return { verdict, generation: String(metadata.generation) };
    } catch { return { verdict: "error" as const, generation: null }; }
    finally { scanReadActive = false; }
  },
  async file(objectPath: string, generation?: string | null) {
    const file = await storage.getObjectEntityFile(objectPath);
    return generation ? file.bucket.file(file.name, { generation }) : file;
  },
};
