import { PDFDocument } from "pdf-lib";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_COMPLETION_WINDOW_MS = 30 * 60_000;
// Longer than the 15-minute PUT URL, completion window, and slow uploads.
// Never lower this based solely on the age of a database reservation.
export const DOCUMENT_CLEANUP_GRACE_MS = 48 * 60 * 60_000;
export class DocumentValidationError extends Error {}

export function validDocumentSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "application/pdf") return Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  if (contentType === "image/png") return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return false;
}

// Format validation is NOT malware scanning, OCR, or evidence verification.
// Parse PDFs without rendering, and reject encrypted/structurally broken files.
export async function validateDocumentBytes(bytes: Uint8Array, contentType: string) {
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
    // Do not log parser errors: they may contain document contents.
    throw new DocumentValidationError();
  }
}
