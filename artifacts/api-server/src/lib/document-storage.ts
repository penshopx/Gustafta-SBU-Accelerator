import { ObjectNotFoundError, ObjectStorageService, objectStorageClient } from "./objectStorage";
import { setObjectAclPolicy } from "./objectAcl";
import { DocumentValidationError, MAX_DOCUMENT_BYTES, validateDocumentBytes, validDocumentSignature } from "./document-validation";

const storage = new ObjectStorageService();
export { DocumentValidationError, MAX_DOCUMENT_BYTES, validDocumentSignature } from "./document-validation";
export const documentStorage = {
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
  async file(objectPath: string) {
    return storage.getObjectEntityFile(objectPath);
  },
};
