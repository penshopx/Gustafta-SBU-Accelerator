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
  entryPoints: [fileURLToPath(new URL("../src/lib/sbu-chat-retrieval.ts", import.meta.url))],
  outfile: join(temp, "retrieval.mjs"), bundle: true, platform: "node", format: "esm",
});
const { CHAT_SOURCE_VERSIONS, retrieveChatSources } = await import(pathToFileURL(join(temp, "retrieval.mjs")).href);
const source = CHAT_SOURCE_VERSIONS.find(v => v.sourceKey === "implementasi-permen-pu6-diskusi");

test("discussion deck exposes seven immutable, bounded, unverified page summaries", () => {
  assert.equal(source.baseline, true);
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
    const found = retrieveChatSources(question);
    assert.equal(found[0].id, `implementasi-pu6-${id}@${source.versionId}`);
    assert.match(found[0].locator, new RegExp(`PDF hlm\\. ${page} `));
  }
});

test("ISO editions, local equipment states and transition dates are not promoted to rules", () => {
  const find = name => source.citations.find(c => c.id.startsWith(`implementasi-pu6-${name}@`));
  assert.match(find("smap").limitation, /bukan verifikasi edisi SNI\/ISO/);
  assert.match(find("smap").limitation, /Tidak menyelesaikan perbedaan/);
  assert.match(find("peralatan").limitation, /bukan status verifikasi catatan lokal/);
  assert.match(find("transisi").limitation, /Tanggal dan hitung mundur tetap ditahan/);
  assert.match(find("lkut").limitation, /Tidak menetapkan tenggat otomatis/);
});
