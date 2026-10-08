import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { PDFDocument } from "pdf-lib";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temporary = await mkdtemp(join(dir, ".document-validation-"));
after(() => rm(temporary, { recursive: true, force: true }));
await build({
  entryPoints: [join(dir, "../src/lib/document-validation.ts")], outfile: join(temporary, "validation.mjs"),
  platform: "node", bundle: true, format: "esm", external: ["pdf-lib"],
});
const { validateDocumentBytes, validDocumentSignature, DocumentValidationError } = await import(join(temporary, "validation.mjs"));

test("valid real PDF passes; forged header, forged EOF and truncated PDFs fail", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  const bytes = await pdf.save();
  await validateDocumentBytes(bytes, "application/pdf");
  for (const malformed of [
    "%PDF-1.4\nThis is not a PDF",
    "%PDF-1.4\nThis is not a PDF\n%%EOF",
    "<html>not a PDF</html>",
  ]) {
    await assert.rejects(validateDocumentBytes(Buffer.from(malformed), "application/pdf"), DocumentValidationError);
  }
  await assert.rejects(validateDocumentBytes(bytes.subarray(0, bytes.length - 20), "application/pdf"), DocumentValidationError);
});
test("type signatures cannot be swapped or used for disallowed content", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(validDocumentSignature(png, "image/png"), true);
  assert.equal(validDocumentSignature(png, "image/jpeg"), false);
  assert.equal(validDocumentSignature(Buffer.from("<html>"), "text/html"), false);
  await assert.rejects(validateDocumentBytes(Buffer.alloc(0), "image/png"), DocumentValidationError);
  await assert.rejects(validateDocumentBytes(Buffer.from("<html>"), "image/png"), DocumentValidationError);
});
