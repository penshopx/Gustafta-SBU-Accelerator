import { createHash } from "node:crypto";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { knowledgePdfObjectName, type KnowledgePdfFile } from "./knowledge-pdf-manifest";

export const MAX_KNOWLEDGE_PDF_BYTES = 8 * 1024 * 1024;
export const knowledgePdfByteLimit = (file: KnowledgePdfFile) =>
  "maxBytes" in file ? file.maxBytes : MAX_KNOWLEDGE_PDF_BYTES;
export function assertKnowledgePdf(bytes: Buffer, file: KnowledgePdfFile) {
  if (!bytes.length || bytes.length > knowledgePdfByteLimit(file) ||
      bytes.subarray(0, 5).toString() !== "%PDF-" ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    throw new Error("knowledge_pdf_integrity");
  }
}
export const knowledgePdfStorage = {
  async read(file: KnowledgePdfFile, signal: AbortSignal): Promise<Buffer> {
    signal.throwIfAborted();
    const [bucket, ...prefix] = new ObjectStorageService().getPrivateObjectDir().replace(/^\/|\/$/g, "").split("/");
    const object = objectStorageClient.bucket(bucket).file([...prefix, knowledgePdfObjectName(file)].join("/"));
    const limit = knowledgePdfByteLimit(file);
    const stream = object.createReadStream({ start: 0, end: limit });
    const abort = () => stream.destroy(new Error("knowledge_pdf_aborted"));
    signal.addEventListener("abort", abort, { once: true });
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const raw of stream) {
        signal.throwIfAborted();
        const chunk = Buffer.from(raw);
        size += chunk.length;
        if (size > limit) throw new Error("knowledge_pdf_too_large");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      assertKnowledgePdf(bytes, file);
      return bytes;
    } finally {
      signal.removeEventListener("abort", abort);
      stream.destroy();
    }
  },
};
