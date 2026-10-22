import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFDocument, PDFName } from "pdf-lib";
import { MAX_DOCUMENT_BYTES } from "./document-validation";

export const MAX_ANALYSIS_BYTES = 4 * 1024 * 1024;
export class AnalysisFormatError extends Error {}
const exec = promisify(execFile);

export function sourceRevision(document: { id: string; version: number; scanGeneration: string | null }) {
  return createHash("sha256").update(JSON.stringify([document.id, document.version, document.scanGeneration])).digest("hex");
}

export async function sourcePageCount(bytes: Buffer, contentType: string) {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new AnalysisFormatError();
  if (["image/png", "image/jpeg"].includes(contentType)) return 1;
  if (contentType !== "application/pdf") throw new AnalysisFormatError();
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    if (pdf.isEncrypted || pdf.getPageCount() < 1) throw new AnalysisFormatError();
    return pdf.getPageCount();
  } catch { throw new AnalysisFormatError(); }
}

export function validatePages(pages: number[], count: number) {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 10 ||
      new Set(pages).size !== pages.length ||
      pages.some(p => !Number.isSafeInteger(p) || p < 1 || p > count)) throw new AnalysisFormatError();
}

// Do not copy PDF pages/resources: shared resource dictionaries, annotations,
// attachments and nested objects can retain data from unselected pages.
// Only locally rendered pixels enter a fresh, image-only PDF.
export async function prepareAnalysisPayload(
  bytes: Buffer, contentType: string, pages: number[], signal: AbortSignal,
): Promise<{ bytes: Buffer; pageCount: number; images: { sourcePage: number; dataUrl: string }[] }> {
  const pageCount = await sourcePageCount(bytes, contentType);
  validatePages(pages, pageCount);
  signal.throwIfAborted();
  if (contentType !== "application/pdf") {
    if (bytes.length > MAX_ANALYSIS_BYTES) throw new AnalysisFormatError();
    return { bytes, pageCount, images: [{ sourcePage: 1, dataUrl: `data:${contentType};base64,${bytes.toString("base64")}` }] };
  }
  const dir = await mkdtemp(join(tmpdir(), "sbu-analysis-"));
  try {
    const input = join(dir, "source.pdf");
    const output = join(dir, "page.png");
    await writeFile(input, bytes, { mode: 0o600 });
    const payload = await PDFDocument.create({ updateMetadata: false });
    const images: { sourcePage: number; dataUrl: string }[] = [];
    for (const number of pages) {
      signal.throwIfAborted();
      // OS limits bound hostile rendering; no shell, network URLs or arbitrary
      // user paths. MuPDF renders only the explicit original page number.
      await exec("prlimit", ["--as=805306368", "--cpu=20", "--fsize=8388608", "--",
        "mutool", "draw", "-q", "-F", "png", "-r", "120", "-w", "1800", "-h", "1800",
        "-o", output, input, String(number)],
      { signal, timeout: 25000, maxBuffer: 64 * 1024 });
      if ((await stat(output)).size > MAX_ANALYSIS_BYTES) throw new AnalysisFormatError();
      const rendered = await readFile(output);
      const image = await payload.embedPng(rendered);
      images.push({ sourcePage: number, dataUrl: `data:image/png;base64,${rendered.toString("base64")}` });
      const page = payload.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    payload.context.trailerInfo.Info = undefined;
    payload.catalog.delete(PDFName.of("Metadata"));
    const result = Buffer.from(await payload.save());
    if (result.length > MAX_ANALYSIS_BYTES) throw new AnalysisFormatError();
    return { bytes: result, pageCount, images };
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted();
    // Parser/renderer diagnostics may contain private source contents.
    throw new AnalysisFormatError();
  } finally { await rm(dir, { recursive: true, force: true }); }
}
