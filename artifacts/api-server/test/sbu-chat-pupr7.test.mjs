import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "pupr7-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: {
    contents: 'export * from "./sbu-chat-retrieval"; export * from "./sbu-chat-source-reviews"; export * from "./knowledge-pdf-manifest";',
    resolveDir: fileURLToPath(new URL("../src/lib/", import.meta.url)),
  },
  external: ["@workspace/db"],
  outfile: join(temp, "check.mjs"), bundle: true, platform: "node", format: "esm",
});
const { CHAT_SOURCE_VERSIONS, retrieveChatSources, createChatSourceReviewStore, knowledgePdf } = await import(pathToFileURL(join(temp, "check.mjs")));
const source = CHAT_SOURCE_VERSIONS.find(s => s.sourceKey === "permen-pupr-7-2024");
const candidate = CHAT_SOURCE_VERSIONS.find(s => s.sourceKey === "permen-pupr-7-2024" && s.versionId === "pupr7-20261104-r2");

test("one uploaded regulation has six bounded citations and exact private PDF references", () => {
  assert.equal(CHAT_SOURCE_VERSIONS.filter(s => s.sourceKey === source.sourceKey).length, 2);
  assert.equal(source.citations.length, 6);
  // Actual original-byte validation belongs to the operator archive check.
  // Regression tests must not depend on untracked attachment files.
  const sha = "d2af3e4ac7b8f1b5b503ae88d4a1afb8aee76ba80989d4719dd7af3b765cd228";
  for (const c of source.citations) {
    assert.equal(c.verificationStatus, "unverified");
    assert.match(c.document, /Permen PUPR Nomor 7 Tahun 2024/);
    assert.doesNotMatch(c.document, /Permendagri/);
    assert.ok(c.id.endsWith(`@${source.versionId}`));
    const { metadata } = knowledgePdf(source.sourceKey, source.versionId, c.id);
    assert.equal(metadata.sha256, sha);
    assert.equal(metadata.pageCount, 169);
    assert.equal(metadata.page, Number(c.locator.match(/PDF hlm\. (\d+)/)[1]));
  }
});

test("official metadata and the annual BUJK coaching detail are versioned and wait for source review", async () => {
  assert.equal(source.versionId, "pupr7-20261104-r1");
  assert.equal(source.baseline, true, "current approved/default snapshot stays active");
  assert.equal(candidate.versionId, "pupr7-20261104-r2");
  assert.equal(candidate.baseline, false, "candidate must not silently replace active retrieval");

  const responsibility = candidate.citations.find(c => c.id.startsWith("pupr7-tanggung-jawab@"));
  assert.match(responsibility.excerpt, /Pasal 17 ayat \(3\).*paling sedikit satu kali dalam satu tahun/);
  assert.equal(responsibility.sourceUrl, "https://peraturan.bpk.go.id/Details/291479/permen-pupr-no-7-tahun-2024");

  const metadata = candidate.citations.find(c => c.id.startsWith("pupr7-bpk-metadata@"));
  assert.equal(metadata.verificationStatus, "verified");
  assert.match(metadata.verificationScope, /metadata.*saja/i);
  assert.match(metadata.limitation, /PDF resmi tidak berhasil diunduh.*hash/i);
  assert.equal(knowledgePdf(source.sourceKey, candidate.versionId, metadata.id), undefined,
    "external metadata card must not masquerade as an archived PDF page");

  const rows = [];
  const mockPool = {
    async query() { return { rows }; },
    async connect() { throw Error("candidate test only reads decisions"); },
  };
  const store = createChatSourceReviewStore(mockPool);
  assert.ok((await store.active()).some(v => v.versionId === source.versionId));
  assert.ok(!(await store.active()).some(v => v.versionId === candidate.versionId));

  rows.push({
    sourceKey: candidate.sourceKey, versionId: candidate.versionId, status: "approved",
    citations: candidate.citations, decidedAt: new Date("2026-11-04T00:00:00Z"),
  });
  const activeAfterReview = await store.active();
  assert.ok(activeAfterReview.some(v => v.versionId === candidate.versionId));
  assert.ok(!activeAfterReview.some(v => v.versionId === source.versionId));
  assert.equal(retrieveChatSources("metadata JDIH BPK status berlaku 5 Juli 2024", activeAfterReview)
    .find(c => c.id === metadata.id)?.verificationStatus, "verified");
});

test("primary excerpts are found by distinct questions with the correct article and page", () => {
  for (const [q, name, page] of [
    ["pengembangan usaha berkelanjutan pembinaan anggota pupr 7/2024", "pub", 3],
    ["pub umum workshop sosialisasi laporan kegiatan pub pasal 7", "pub-umum", 4],
    ["pub khusus pendampingan intensif bimbingan teknis modul peningkatan kinerja pasal 13", "pub-khusus", 5],
    ["lkut laporan kegiatan usaha tahunan 30 april pasal 10 tahun berikutnya pengisian kinerja", "lkut", 5],
    ["tanggung jawab bujk pasal 17 kewajiban anggota daftar prioritas asosiasi", "tanggung-jawab", 9],
    ["format lkut lampiran a data kepatuhan kinerja manajemen perusahaan data keuangan serah terima pengalaman", "format-lkut", 11],
  ]) {
    const [found] = retrieveChatSources(q);
    assert.equal(found.id, `pupr7-${name}@${source.versionId}`);
    assert.match(found.locator, new RegExp(`PDF hlm\\. ${page}`));
  }
});

test("withdrawal removes the source without readmission through its duplicate upload", async () => {
  const store = createChatSourceReviewStore({
    async query() { return { rows: [{ sourceKey: source.sourceKey, versionId: source.versionId, status: "withdrawn", citations: source.citations, decidedAt: new Date("2026-11-04T00:00:00Z") }] }; },
    async connect() { throw Error("unexpected write"); },
  });
  const active = await store.active();
  assert.ok(active.every(s => s.sourceKey !== source.sourceKey));
  assert.ok(retrieveChatSources("pupr 7/2024 pasal 17 kewajiban anggota", active).every(c => !c.id.startsWith("pupr7-")));
});

test("deadline, performance and local completion limits remain explicit", () => {
  const find = name => source.citations.find(c => c.id.startsWith(`pupr7-${name}@`));
  assert.match(find("lkut").excerpt, /menengah, besar dan spesialis/);
  assert.match(find("lkut").limitation, /Tidak mengaktifkan tenggat otomatis/);
  assert.match(find("pub-umum").limitation, /tidak sama dengan tenggat LKUT/);
  assert.match(find("pub-khusus").limitation, /Tidak menghitung grade/);
  assert.match(find("format-lkut").limitation, /bukan seluruh format/);
  assert.match(find("tanggung-jawab").limitation, /bukan bukti keanggotaan aktif/);
});
