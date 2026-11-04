import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "implementasi-pu6-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: {
    contents: 'export * from "./sbu-chat-retrieval"; export * from "./sbu-chat-source-reviews";',
    resolveDir: fileURLToPath(new URL("../src/lib/", import.meta.url)),
  },
  external: ["@workspace/db"],
  outfile: join(temp, "retrieval.mjs"), bundle: true, platform: "node", format: "esm",
});
const { CHAT_SOURCE_VERSIONS, retrieveChatSources, createChatSourceReviewStore } = await import(pathToFileURL(join(temp, "retrieval.mjs")).href);
const source = CHAT_SOURCE_VERSIONS.find(v => v.sourceKey === "implementasi-permen-pu6-diskusi" && v.versionId.endsWith("-r1"));
const expanded = CHAT_SOURCE_VERSIONS.find(v => v.sourceKey === source.sourceKey && v.baseline);

test("discussion deck exposes seven immutable, bounded, unverified page summaries", () => {
  assert.equal(source.baseline, false, "historical snapshot retained, no longer the default");
  assert.equal(source.citations.length, 7);
  const all = CHAT_SOURCE_VERSIONS.flatMap(v => v.citations);
  assert.equal(new Set(all.map(c => c.id)).size, all.length);
  for (const c of source.citations) {
    assert.ok(c.id.endsWith(`@${source.versionId}`));
    assert.match(c.locator, /PDF hlm\. \d+/);
    assert.equal(c.verificationStatus, "unverified");
    assert.match(c.documentStatus, /bukan peraturan/);
    assert.match(c.limitation, /bukan URL penerbit PDF/);
    assert.ok(source.keywords[c.id].length);
  }
});

test("each curated topic is retrievable with the inspected PDF page", () => {
  for (const [question, id, page] of [
    ["implementasi lkut pelaporan tahunan kinerja manajemen kinerja proyek", "lkut", 25],
    ["implementasi pub umum pub khusus pendampingan modul", "pub", 32],
    ["implementasi kriteria kualifikasi penjualan tahunan kemampuan keuangan ketersediaan tkk", "kualifikasi", 57],
    ["implementasi pencatatan peralatan simpk terdata sementara terdata final", "peralatan", 67],
    ["implementasi persyaratan tambahan perpanjangan asosiasi pemilik manfaat", "tambahan", 69],
    ["implementasi smap iso 37001 sertifikat smap komitmen smap", "smap", 81],
    ["implementasi ketentuan peralihan konversi transisi surat pemicu", "transisi", 44],
  ]) {
    const found = retrieveChatSources(question, [source]);
    assert.equal(found[0].id, `implementasi-pu6-${id}@${source.versionId}`);
    assert.match(found[0].locator, new RegExp(`PDF hlm\\. ${page} `));
  }
});

test("expanded snapshot keeps old content immutable and adds six inspected page references", () => {
  assert.equal(expanded.versionId, "implementasi-pu6-20261104-r2");
  assert.equal(expanded.citations.length, 13);
  for (const before of source.citations) {
    const after = expanded.citations.find(c => c.id.split("@")[0] === before.id.split("@")[0]);
    assert.deepEqual({ ...after, id: before.id }, before);
  }
  for (const c of expanded.citations) {
    assert.equal(c.verificationStatus, "unverified");
    assert.ok(c.id.endsWith(`@${expanded.versionId}`));
    assert.ok(expanded.keywords[c.id].length);
  }
  for (const [question, name, page] of [
    ["legalitas nib sertifikat standar perizinan berbasis risiko pp 28/2025", "legalitas", 16],
    ["oss standar kegiatan usaha lisensi lsbu lisensi lsp portal kementerian", "oss", 17],
    ["tenaga kerja tkk pjbu pjtbu pjkbu penugasan penggantian personel", "tkk", 62],
    ["jenjang skk persyaratan personel multi-klasifikasi multi-subklasifikasi perangkapan jabatan", "skk", 63],
    ["tahapan permohonan registrasi kelengkapan data pembayaran lsbu sbu digital alur sertifikasi", "tahapan", 73],
    ["jenis permohonan permohonan baru perubahan kualifikasi perubahan data pencabutan persetujuan penolakan", "jenis", 77],
  ]) {
    const [found] = retrieveChatSources(question);
    assert.equal(found.id, `implementasi-pu6-${name}@${expanded.versionId}`);
    assert.match(found.locator, new RegExp(`PDF hlm\\. ${page}`));
  }
});

test("same-source withdrawal blocks both versions; a pinned old approval is not silently replaced", async () => {
  let rows = [];
  const store = createChatSourceReviewStore({
    async query() { return { rows }; },
    async connect() { throw Error("unexpected write"); },
  });
  const active = async () => (await store.active()).filter(v => v.sourceKey === source.sourceKey);
  assert.deepEqual((await active()).map(v => v.versionId), [expanded.versionId]);
  const decision = {
    sourceKey: source.sourceKey, versionId: source.versionId,
    status: "withdrawn", decidedAt: new Date("2026-11-04T00:00:00Z"), citations: source.citations,
  };
  rows = [decision];
  assert.equal((await active()).length, 0);
  rows = [{ ...decision, status: "approved" }];
  assert.deepEqual((await active()).map(v => v.versionId), [source.versionId]);
  rows = [{ ...decision, status: "approved", versionId: expanded.versionId, citations: expanded.citations }];
  assert.deepEqual((await active()).map(v => v.versionId), [expanded.versionId]);
  const [answer] = retrieveChatSources("legalitas nib sertifikat standar", await active());
  assert.ok(answer.id.endsWith(`@${expanded.versionId}`));
});

test("expanded references do not certify OSS, staffing, SKK or external submissions", () => {
  const find = name => expanded.citations.find(c => c.id.startsWith(`implementasi-pu6-${name}@`));
  assert.match(find("legalitas").limitation, /Tidak menyimpulkan NIB saja cukup/);
  assert.match(find("oss").limitation, /tidak mengirim permohonan/);
  assert.match(find("tkk").limitation, /bukan verifikasi keaslian/);
  assert.match(find("skk").limitation, /belum diadopsi sebagai matriks SKK–SBU/);
  assert.match(find("tahapan").limitation, /bukan jaminan.*tarif, durasi/);
  assert.match(find("jenis").limitation, /tidak menambah jenis layanan otomatis/);
});

test("ISO editions, local equipment states and transition dates are not promoted to rules", () => {
  const find = name => source.citations.find(c => c.id.startsWith(`implementasi-pu6-${name}@`));
  assert.match(find("smap").limitation, /bukan verifikasi edisi SNI\/ISO/);
  assert.match(find("smap").limitation, /Tidak menyelesaikan perbedaan/);
  assert.match(find("peralatan").limitation, /bukan status verifikasi catatan lokal/);
  assert.match(find("transisi").limitation, /Tanggal dan hitung mundur tetap ditahan/);
  assert.match(find("lkut").limitation, /Tidak menetapkan tenggat otomatis/);
});
