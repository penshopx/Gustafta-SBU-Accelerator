import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { build } from "esbuild";
import express from "express";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".pdf-fixture-"));
await build({
  stdin: { contents: `export * from "../src/routes/knowledge-pdf"; export * from "../src/lib/knowledge-pdf-storage"; export * from "../src/lib/knowledge-pdf-manifest"; export * from "../src/lib/sbu-chat-retrieval";`, resolveDir: dir },
  outfile: join(temp, "fixture.mjs"), bundle: true, platform: "node", format: "esm", external: ["express"],
  plugins: [{
    name: "offline-only",
    setup(b) {
      b.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "auth", namespace: "fixture" }));
      b.onResolve({ filter: /\/objectStorage$/ }, () => ({ path: "storage", namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: path === "auth" ? "export const getAuth = req => ({ userId: req.get('X-Test-Identity') ?? null });"
          : `export class ObjectStorageService { getPrivateObjectDir(){ return '/synthetic/private'; } } export const objectStorageClient = { bucket(){return {file(name){globalThis.__pdfObjectName=name;return {createReadStream(){return globalThis.__pdfStream;}}}}} };`,
        loader: "js",
      }));
      b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "forbidden", namespace: "db-guard" }));
      b.onLoad({ filter: /.*/, namespace: "db-guard" }, () => ({ contents: "export const pool = {query(){throw Error('unexpected DB access')}};", loader: "js" }));
    },
  }],
});
const { createKnowledgePdfRouter, CHAT_SOURCE_VERSIONS, KNOWLEDGE_PDFS, knowledgePdf,
  knowledgePdfStorage, assertKnowledgePdf, knowledgePdfByteLimit, MAX_KNOWLEDGE_PDF_BYTES } = await import(join(temp, "fixture.mjs"));
const catalog = structuredClone(CHAT_SOURCE_VERSIONS);
let versions = catalog, failLedger = false, readCalls = 0, read = async () => Buffer.from("%PDF-synthetic");
const store = { async active() { if (failLedger) throw Error("secret-ledger-error"); return structuredClone(versions); } };
const app = express();
app.use("/api", createKnowledgePdfRouter(store, { read: (...args) => { readCalls++; return read(...args); } }));
const server = app.listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api/knowledge-sources/`;
const id = catalog.find(v => v.sourceKey === KNOWLEDGE_PDFS[0].sourceKey).citations[0].id;
const headers = { "X-Test-Identity": "synthetic-a", "X-SBU-Form-Owner": "synthetic-a" };
const get = (citation = id, h = headers) => fetch(`${base}${encodeURIComponent(citation)}/pdf`, { headers: h });
after(async () => {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await rm(temp, { recursive: true, force: true });
  delete globalThis.__pdfStream; delete globalThis.__pdfObjectName;
});

test("all sixteen targets bind exact immutable version, SHA and PDF page (not printed slide)", () => {
  let count = 0;
  for (const version of catalog) for (const citation of version.citations) {
    const pdf = knowledgePdf(version.sourceKey, version.versionId, citation.id);
    if (pdf) { count++; assert.ok(pdf.metadata.page <= pdf.metadata.pageCount); }
  }
  assert.equal(count, 16);
  const pdf = knowledgePdf("teras-lpjk-12-pelaku-usaha", "teras12-pelaku-20261028-r1", "teras12-pelaku-smap-pub@teras12-pelaku-20261028-r1");
  assert.equal(pdf.metadata.page, 6);
  assert.equal(knowledgePdf(KNOWLEDGE_PDFS[0].sourceKey, "unknown", id), undefined);
});
test("large curated original has an explicit bound without raising other PDF limits", () => {
  const file = KNOWLEDGE_PDFS.find(f => f.sourceKey === "implementasi-permen-pu6-diskusi");
  assert.equal(knowledgePdfByteLimit(file), 33387216);
  assert.equal(knowledgePdfByteLimit(KNOWLEDGE_PDFS[0]), MAX_KNOWLEDGE_PDF_BYTES);
  assert.equal(MAX_KNOWLEDGE_PDF_BYTES, 8 * 1024 * 1024);
  const bytes = Buffer.from("%PDF-fixture");
  const limited = { ...file, maxBytes: 4, sha256: createHash("sha256").update(bytes).digest("hex") };
  assert.throws(() => assertKnowledgePdf(bytes, limited), /integrity/);
});
test("no session, forged owner, unknown ID, and old version never read storage", async () => {
  for (const [citation, h, code] of [
    [id, {}, 401], [id, { "X-SBU-Form-Owner": "synthetic-a" }, 401],
    [id, { ...headers, "X-SBU-Form-Owner": "synthetic-b" }, 409],
    ["../../private/document", headers, 404], [id.replace("r1", "r0"), headers, 404],
  ]) {
    const before = readCalls; const res = await get(citation, h);
    assert.equal(res.status, code);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(readCalls, before);
    assert.doesNotMatch(await res.text(), /secret-ledger|synthetic\/private/);
  }
});
test("successful private response contains complete PDF, safe filename and no public URL", async () => {
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(res.headers.get("content-disposition"), /^inline; filename="teras-lpjk-12-materi-1.pdf"$/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await res.text(), "%PDF-synthetic");
});
test("withdrawal before and during IO blocks original bytes; ledger/storage errors are sanitized", async () => {
  try {
    versions = catalog.filter(v => v.sourceKey !== KNOWLEDGE_PDFS[0].sourceKey);
    const before = readCalls;
    assert.equal((await get()).status, 404); assert.equal(readCalls, before);
    versions = catalog;
    read = async () => { versions = []; return Buffer.from("%PDF-should-not-escape"); };
    const withdrawn = await get();
    assert.equal(withdrawn.status, 404); assert.doesNotMatch(await withdrawn.text(), /%PDF/);
    versions = catalog; failLedger = true;
    assert.equal((await get()).status, 503);
    failLedger = false;
    read = async () => { throw Error("sensitive-bucket-or-provider-error"); };
    const failed = await get(); assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /sensitive-bucket|%PDF/);
  } finally { versions = catalog; failLedger = false; read = async () => Buffer.from("%PDF-synthetic"); }
});
test("storage accepts exact synthetic hash and rejects tampering without customer access", async () => {
  const bytes = Buffer.from("%PDF-synthetic-offline-fixture");
  const file = { ...KNOWLEDGE_PDFS[0], sha256: createHash("sha256").update(bytes).digest("hex") };
  globalThis.__pdfStream = Readable.from([bytes]);
  assert.deepEqual(await knowledgePdfStorage.read(file, new AbortController().signal), bytes);
  assert.match(globalThis.__pdfObjectName, /^private\/curated-knowledge\/[a-f0-9]{64}\.pdf$/);
  assert.throws(() => assertKnowledgePdf(Buffer.from("%PDF-tampered"), file), /integrity/);
  globalThis.__pdfStream = Readable.from([Buffer.from("%PDF-tampered")]);
  await assert.rejects(knowledgePdfStorage.read(file, new AbortController().signal), /integrity/);
});
test("aborted storage reads destroy their stream instead of leaving an active connection", async () => {
  const stream = new Readable({ read() {} });
  globalThis.__pdfStream = stream;
  const controller = new AbortController();
  const pending = knowledgePdfStorage.read(KNOWLEDGE_PDFS[0], controller.signal);
  controller.abort();
  await assert.rejects(pending, /aborted/);
  assert.equal(stream.destroyed, true);
});
