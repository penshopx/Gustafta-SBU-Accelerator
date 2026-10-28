// Operator-only, explicit allowlist, create-only. Never changes bucket ACLs or
// scans/lists customer objects. Run from workspace root with the api-server tsx.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { ObjectStorageService, objectStorageClient } from "../src/lib/objectStorage";
import { KNOWLEDGE_PDFS, knowledgePdfObjectName } from "../src/lib/knowledge-pdf-manifest";
import { assertKnowledgePdf } from "../src/lib/knowledge-pdf-storage";
import { validateDocumentBytes } from "../src/lib/document-validation";

const root = process.argv[2];
if (!root) throw new Error("Pass the absolute workspace root");
const [bucket, ...prefix] = new ObjectStorageService().getPrivateObjectDir().replace(/^\/|\/$/g, "").split("/");
for (const file of KNOWLEDGE_PDFS) {
  const bytes = await readFile(resolve(root, "attached_assets", file.upload));
  assertKnowledgePdf(bytes, file);
  await validateDocumentBytes(bytes, "application/pdf");
  if ((await PDFDocument.load(bytes)).getPageCount() !== file.pageCount) throw new Error("knowledge_pdf_pages");
  const object = objectStorageClient.bucket(bucket).file([...prefix, knowledgePdfObjectName(file)].join("/"));
  try {
    await object.save(bytes, {
      resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "application/pdf", cacheControl: "private, no-store",
        metadata: { "custom:aclPolicy": JSON.stringify({ owner: "system:curated-knowledge", visibility: "private" }), sha256: file.sha256 } },
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 412) throw new Error("knowledge_pdf_upload_failed");
    const [existing] = await object.download();
    assertKnowledgePdf(existing, file);
  }
  // Safe operational output only; never bucket paths, credentials or signed URLs.
  process.stdout.write(`Archived ${file.filename}: hash and ${file.pageCount} pages checked.\n`);
}
