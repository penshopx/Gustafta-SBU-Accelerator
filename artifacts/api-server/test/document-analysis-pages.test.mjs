import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { build } from "esbuild";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const temp = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".analysis-pages-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  entryPoints: [fileURLToPath(new URL("../src/lib/document-analysis-pages.ts", import.meta.url)),
    fileURLToPath(new URL("../../gustafta-sbu/src/components/document-analysis-selection.ts", import.meta.url))],
  outdir: temp, outbase: fileURLToPath(new URL("../../", import.meta.url)),
  platform: "node", bundle: true, format: "esm", outExtension: { ".js": ".mjs" }, external: ["pdf-lib"],
});
const { prepareAnalysisPayload, sourcePageCount, validatePages, AnalysisFormatError, MAX_ANALYSIS_BYTES } =
  await import(join(temp, "api-server/src/lib/document-analysis-pages.mjs"));
const { parseAnalysisPages } = await import(join(temp, "gustafta-sbu/src/components/document-analysis-selection.mjs"));
const exec = promisify(execFile);
const signal = () => new AbortController().signal;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const imagePixels = pdf => pdf.context.enumerateIndirectObjects()
  .map(([, obj]) => obj).filter(obj => obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"))
  .map(obj => hash(decodePDFRawStream(obj).decode()));

test("long PDF sends only selected visible pixels, not metadata, attachments, hidden text or linked page objects", async () => {
  const doc = await PDFDocument.create();
  for (let p = 1; p <= 25; p++) {
    const page = doc.addPage([320, 200]);
    page.drawText(`UNIQUE_VISIBLE_MARKER_${p}`, { x: 20, y: 80, size: 14 });
    page.drawText(`HIDDEN_OTHER_PAGE_DATA_${p}`, { x: 900, y: 900 });
  }
  doc.setTitle("SECRET_SOURCE_METADATA");
  await doc.attach(Buffer.concat([Buffer.from("SECRET_ATTACHMENT_BYTES"), randomBytes(5 * 1024 * 1024)]), "private.txt");
  // A selected page shares an unused resource with an unselected page. A
  // copyPages-based extractor could carry this object across.
  doc.getPage(1).node.set(PDFName.of("PrivateLinkedPage"), doc.getPage(22).ref);
  const original = Buffer.from(await doc.save());
  assert.ok(original.length > MAX_ANALYSIS_BYTES && original.length < 20 * 1024 * 1024,
    "a source larger than the old 4 MiB limit can still send a small selection");
  const before = hash(original);
  assert.equal(await sourcePageCount(original, "application/pdf"), 25);
  const result = await prepareAnalysisPayload(original, "application/pdf", [15, 2], signal());
  assert.equal(result.pageCount, 25);
  assert.equal(hash(original), before, "original remains unchanged");
  assert.ok(result.bytes.length <= MAX_ANALYSIS_BYTES);
  const payload = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(payload.getPageCount(), 2);
  assert.equal(payload.context.trailerInfo.Info, undefined);
  assert.deepEqual(payload.catalog.keys().map(k => k.toString()).sort(), ["/Pages", "/Type"]);
  const pixels = imagePixels(payload);
  assert.equal(pixels.length, 2);
  const dir = await mkdtemp(join(tmpdir(), "page-isolation-check-"));
  try {
    await writeFile(join(dir, "source.pdf"), original);
    const expected = [];
    for (const p of [15, 2, 23]) {
      await exec("mutool", ["draw", "-q", "-F", "png", "-r", "120", "-w", "1800", "-h", "1800",
        "-o", join(dir, "expected.png"), join(dir, "source.pdf"), String(p)]);
      const check = await PDFDocument.create();
      await check.embedPng(await readFile(join(dir, "expected.png")));
      const loaded = await PDFDocument.load(await check.save(), { updateMetadata: false });
      expected.push(...imagePixels(loaded));
    }
    assert.deepEqual(pixels, expected.slice(0, 2), "actual outgoing pixels equal exactly the selected pages in requested order");
    assert.ok(!pixels.includes(expected[2]), "unselected page pixels absent");
  } finally { await rm(dir, { recursive: true, force: true }); }
  for (const [, obj] of payload.context.enumerateIndirectObjects()) {
    const text = obj instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1") : obj.toString();
    assert.doesNotMatch(text, /SECRET_|HIDDEN_OTHER_|UNIQUE_VISIBLE_|PrivateLinkedPage|EmbeddedFiles|JavaScript/);
  }
});

test("range input is bounded, explicit, ordered, and rejects duplicates or nonexistent pages", () => {
  assert.deepEqual(parseAnalysisPages("2-4, 18, 1", 25), [2, 3, 4, 18, 1]);
  assert.deepEqual(parseAnalysisPages("1-10", 25), Array.from({ length: 10 }, (_, i) => i + 1));
  validatePages(Array.from({ length: 10 }, (_, i) => i + 1), 25);
  for (const input of ["", "0", "-1", "1.5", "1-11", "2-1", "1,1", "1-3,3", "26", "1,", "1e1", "1-99999999999999999"])
    assert.equal(parseAnalysisPages(input, 25), null, input);
  for (const pages of [[], [0], [26], [2, 2], [1.2], Array.from({ length: 11 }, (_, i) => i + 1)])
    assert.throws(() => validatePages(pages, 25), AnalysisFormatError);
});

test("unreadable, oversized output, and aborted preparation never yield an AI payload", async () => {
  await assert.rejects(prepareAnalysisPayload(Buffer.from("%PDF-broken"), "application/pdf", [1], signal()), AnalysisFormatError);
  await assert.rejects(sourcePageCount(Buffer.alloc(20 * 1024 * 1024 + 1), "application/pdf"), AnalysisFormatError);
  await assert.rejects(prepareAnalysisPayload(Buffer.alloc(MAX_ANALYSIS_BYTES + 1), "image/png", [1], signal()), AnalysisFormatError);
  const doc = await PDFDocument.create();
  // High-entropy pixels cannot compress under the 4 MiB outgoing limit.
  const image = doc.context.register(doc.context.flateStream(randomBytes(1500 * 1500 * 3), {
    Type: "XObject", Subtype: "Image", Width: 1500, Height: 1500,
    ColorSpace: "DeviceRGB", BitsPerComponent: 8,
  }));
  const page = doc.addPage([900, 900]);
  page.node.set(PDFName.of("Resources"), doc.context.obj({ XObject: { Noise: image } }));
  page.node.addContentStream(doc.context.register(doc.context.flateStream("q 900 0 0 900 0 0 cm /Noise Do Q")));
  const original = Buffer.from(await doc.save());
  assert.ok(original.length > MAX_ANALYSIS_BYTES && original.length < 20 * 1024 * 1024);
  await assert.rejects(prepareAnalysisPayload(original, "application/pdf", [1], signal()), AnalysisFormatError);
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(prepareAnalysisPayload(original, "application/pdf", [1], ctl.signal), { name: "AbortError" });
});
