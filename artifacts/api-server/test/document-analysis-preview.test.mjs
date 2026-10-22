import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { build } from "esbuild";
import { PDFDocument } from "pdf-lib";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".analysis-preview-"));
after(() => rm(temp, { recursive: true, force: true }));
const stateKey = "__analysisPreviewFixture";
await build({
  entryPoints: [join(dir, "../src/routes/document-analysis.ts")],
  outfile: join(temp, "route.mjs"), bundle: true, platform: "node", format: "esm", external: ["express", "pdf-lib"],
  plugins: [{
    name: "isolated-preview",
    setup(build) {
      build.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
        path: join(dir, "../../../lib/api-zod/src/index.ts"),
      }));
      build.onResolve({ filter: /^(@workspace\/db|@clerk\/express|drizzle-orm)$|\/(document-storage|document-analysis|consultation-analysis|ai-budget|document-analysis-operations)$/ }, args =>
        ({ path: args.path, namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
        const common = `const f=()=>globalThis.${stateKey};`;
        const contents = {
          "@clerk/express": `export const getAuth=req=>({userId:req.get("Test-User")||null});`,
          "drizzle-orm": `
            export const eq=(column,value)=>row=>row[column]===value;
            export const and=(...predicates)=>row=>predicates.every(p=>p(row));
            export const desc=x=>x; export const sql=()=>{};`,
          "@workspace/db": `${common}
            const table=name=>new Proxy({}, {get:(_,key)=>name+"."+key});
            export const documentsTable=table("document"), casesTable=table("case"), documentAnalysesTable=table("analysis"),
              documentAnalysisOperationsTable=table("operation");
            export const db={
              select(){ f().reads++; return {from(){return {innerJoin(){return {
                async where(predicate){
                  const row=Object.fromEntries(Object.entries(f().document).map(([k,v])=>["document."+k,v]));
                  row["case.id"]=f().document.caseId; row["case.ownerId"]=f().caseOwner;
                  return predicate(row)?[{document:{...f().document}}]:[];
                }
              }}}}}},
              insert(){throw Error("preview must not write")},
              delete(){throw Error("preview must not write")},
              transaction(){throw Error("preview must not write")}
            };`,
          "../lib/document-storage": `${common}
            export const documentStorage={async file(path,generation){
              f().storageReads++; f().fileArgs=[path,generation];
              return {
                async getMetadata(){return [{size:f().bytes.length,contentType:f().document.contentType}]},
                async download(){if(f().changeVersion) f().document.version++; return [f().bytes]}
              };
            }};`,
          "../lib/document-analysis": `
            export {AnalysisFormatError,MAX_ANALYSIS_BYTES} from ${JSON.stringify(join(dir, "../src/lib/document-analysis-pages.ts"))};
            export const ANALYSIS_MODEL="synthetic", ANALYSIS_DISCLAIMER="fixture";
            export async function analyzeDocumentBytes(){throw Error("no AI in preview")};`,
          "../lib/consultation-analysis": `
            export class ConsultationSourceError extends Error {}
            export const consultationAnalysis=()=>{throw Error("no consultation in preview")};
            export const sourceErrorMessage=()=>"fixture";`,
          "../lib/ai-budget": `export class AiBudgetError extends Error {}
            export const reserveAiBudget=()=>{throw Error("no budget reservation in preview")};`,
          "../lib/document-analysis-operations": `
            export class DocumentOperationError extends Error { constructor(status){super();this.status=status;} }
            export const DOCUMENT_OPERATION_TIMEOUT_MS=70000;
            const counts=new Map();
            export const documentOperationStore={
              async reserve(owner,kind){
                const key=owner+kind, count=counts.get(key)||0;
                if(count>=12) throw new DocumentOperationError(429);
                counts.set(key,count+1);return "fixture-token";
              }, async release(){}, async assertCurrent(){}
            };`,
        }[args.path];
        assert.ok(contents, args.path);
        return { contents, loader: "js", resolveDir: dir };
      });
    },
  }],
});
const { createDocumentAnalysisRouter } = await import(join(temp, "route.mjs"));
const { createHash } = await import("node:crypto");
const revision = doc => createHash("sha256").update(JSON.stringify([doc.id, doc.version, doc.scanGeneration])).digest("hex");

test("local preview keeps owner, case, generation, revision and payload limits without AI or writes", async () => {
  const pdf = await PDFDocument.create();
  for (let i = 1; i <= 12; i++) pdf.addPage([200, 150]).drawText(`Page ${i}`, { x: 10, y: 70, size: 12 });
  const bytes = Buffer.from(await pdf.save());
  const document = { id: "11111111-1111-4111-8111-111111111111", caseId: 5, ownerId: "owner-a",
    version: 2, scanGeneration: "scanned-generation", size: bytes.length, contentType: "application/pdf",
    status: "ready", scanStatus: "clean", objectPath: "private/fixture" };
  const f = globalThis[stateKey] = { document, bytes, caseOwner: "owner-a", reads: 0, storageReads: 0 };
  let aiCalls = 0, budgetCalls = 0;
  const app = express(); app.use(express.json());
  app.use(createDocumentAnalysisRouter(async () => { aiCalls++; throw Error("AI forbidden"); },
    async () => { budgetCalls++; throw Error("budget forbidden"); }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const path = `/cases/5/documents/${document.id}/analysis-preview`;
  const call = async ({ user = "owner-a", owner = user, url = path, body = { pages: [12, 2], sourceRevision: revision(document) } } = {}) => {
    const response = await fetch(base + url, { method: "POST",
      headers: { "Content-Type": "application/json", ...(user ? { "Test-User": user } : {}),
        ...(owner ? { "X-SBU-Form-Owner": owner } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  };
  try {
    for (const args of [{ user: null }, { owner: null }, { owner: "owner-b" }]) {
      assert.equal((await call(args)).status, args.user === null ? 401 : 409);
      assert.equal(f.reads, 0, "session/immutable owner checked before persistence");
    }
    for (const args of [{ user: "owner-b" }, { url: path.replace("/cases/5/", "/cases/6/") },
      { url: path.replace(document.id, "22222222-2222-4222-8222-222222222222") }]) {
      assert.equal((await call(args)).status, 404);
    }
    f.caseOwner = "owner-b";
    assert.equal((await call()).status, 404);
    f.caseOwner = "owner-a";
    for (const scanStatus of ["pending", "infected"]) {
      document.scanStatus = scanStatus;
      assert.equal((await call()).status, 404);
    }
    document.scanStatus = "clean";
    assert.equal((await call({ body: { pages: [1], sourceRevision: "0".repeat(64) } })).status, 409);
    for (const pages of [[], [1, 1], [0], [1.5], Array.from({ length: 11 }, (_, i) => i + 1)])
      assert.equal((await call({ body: { pages, sourceRevision: revision(document) } })).status, 400);
    assert.equal(f.storageReads, 0, "invalid auth, scope, pages and revision never read bytes");
    const preview = await call();
    assert.equal(preview.status, 200);
    assert.equal(preview.cache, "private, no-store");
    assert.equal(preview.body.documentId, document.id);
    assert.equal(preview.body.caseId, 5);
    assert.equal(preview.body.version, 2);
    assert.equal(preview.body.sourceRevision, revision(document));
    assert.deepEqual(preview.body.images.map(image => image.sourcePage), [12, 2]);
    assert.ok(preview.body.payloadBytes > 0 && preview.body.payloadBytes <= 4194304);
    assert.ok(preview.body.images.every(image => /^data:image\/png;base64,/.test(image.dataUrl)));
    assert.deepEqual(f.fileArgs, ["private/fixture", "scanned-generation"]);
    assert.equal((await call({ body: { pages: [13], sourceRevision: revision(document) } })).status, 422);
    f.changeVersion = true;
    assert.equal((await call()).status, 409, "mid-render version change must not return obsolete preview");
    f.changeVersion = false;
    const beforeOldConsent = f.storageReads;
    assert.equal((await call({ url: path.replace("analysis-preview", "analyses"),
      body: { consent: true, focus: "keuangan", pages: [12, 2], sourceRevision: preview.body.sourceRevision } })).status,
    409, "old-version paid consent is rejected before any source access or AI");
    assert.equal(f.storageReads, beforeOldConsent);
    document.contentType = "image/png";
    f.bytes = Buffer.alloc(4194305); document.size = f.bytes.length;
    assert.equal((await call({ body: { pages: [1], sourceRevision: revision(document) } })).status, 422);
    document.contentType = "application/pdf"; f.bytes = bytes; document.size = bytes.length;
    for (let i = 0; i < 8; i++)
      assert.equal((await call({ body: { pages: [13], sourceRevision: revision(document) } })).status, 422);
    assert.equal((await call()).status, 429, "local preview shares the bounded inspection quota");
    assert.equal(aiCalls, 0);
    assert.equal(budgetCalls, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete globalThis[stateKey];
  }
});
