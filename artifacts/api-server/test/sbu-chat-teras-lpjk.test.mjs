import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "teras-lpjk-"));
const entry = fileURLToPath(new URL("../src/lib/sbu-chat-retrieval.ts", import.meta.url));
try {
  await build({ entryPoints: [entry], outfile: join(temp, "retrieval.mjs"), bundle: true, platform: "node", format: "esm" });
} catch (error) {
  await rm(temp, { recursive: true, force: true });
  throw error;
}
const { CHAT_SOURCE_VERSIONS, retrieveChatSources, validateCitedAnswer } =
  await import(pathToFileURL(join(temp, "retrieval.mjs")).href);
after(() => rm(temp, { recursive: true, force: true }));
const presentations = CHAT_SOURCE_VERSIONS.filter(v => v.sourceKey.startsWith("teras-lpjk-"));

test("three presentations provide nine bounded, versioned excerpts, not verified laws", () => {
  assert.equal(presentations.length, 3);
  const all = CHAT_SOURCE_VERSIONS.flatMap(v => v.citations);
  assert.equal(new Set(all.map(c => c.id)).size, all.length);
  assert.equal(presentations.flatMap(v => v.citations).length, 9);
  for (const version of presentations) {
    assert.equal(version.baseline, true, "initial editorial admission, not a legal verification");
    assert.equal(version.citations.length, 3);
    for (const citation of version.citations) {
      assert.ok(citation.id.endsWith(`@${version.versionId}`));
      assert.equal(citation.verificationStatus, "unverified");
      assert.equal(citation.checkedOn, "2026-10-28");
      assert.match(citation.locator, /PDF hlm\./);
      assert.match(citation.documentStatus, /bukan peraturan/);
      assert.match(citation.limitation, /bukan tautan PDF unggahan/);
      assert.ok(version.keywords[citation.id]?.length);
    }
  }
});

test("questions retrieve the intended presentation with its limits and real PDF locator", () => {
  const usulan = retrieveChatSources("TERAS LPJK Sigit usulan mekanisme konversi tanpa biaya");
  assert.match(usulan[0].id, /^teras12-konversi-usulan@/);
  assert.match(usulan[0].limitation, /bukan jaminan layanan aktif/);
  const systems = retrieveChatSources("TERAS LPJK Hambali kesiapan sistem UAT");
  assert.match(systems[0].id, /^teras12-sistem-pengujian@/);
  assert.match(systems[0].limitation, /bukan laporan hasil uji yang telah lulus/);
  const business = retrieveChatSources("Perspektif Ruslan pelaku usaha bukti SMAP PUB LKUT");
  assert.match(business[0].id, /^teras12-pelaku-smap-pub@/);
  assert.match(business[0].locator, /PDF hlm\. 6–7.*07\/10/);
  assert.match(business[0].limitation, /Perbedaan uraian SMAP belum diselesaikan/);
});

test("proposed dates do not become a transition trigger or enable BG001 assessment", () => {
  const timeline = presentations.flatMap(v => v.citations).find(c => c.id.startsWith("teras12-sistem-timeline@"));
  assert.match(timeline.locator, /PDF hlm\. 8/);
  assert.match(timeline.limitation, /tidak boleh.*tanggal konversi resmi atau hitung mundur/);
  assert.deepEqual(retrieveChatSources("Berapa modal dan jumlah personel BG001 K1?"), []);
});

test("withdrawal removes presentation IDs and old citations cannot return via model output", () => {
  const query = "TERAS LPJK Hambali kesiapan sistem UAT";
  const old = retrieveChatSources(query).find(c => c.id.startsWith("teras12-sistem-"));
  assert.ok(old);
  const without = CHAT_SOURCE_VERSIONS.filter(v => v.sourceKey !== "teras-lpjk-12-sistem");
  const next = retrieveChatSources(query, without);
  assert.ok(next.every(c => !c.id.startsWith("teras12-sistem-")));
  assert.throws(() => validateCitedAnswer(JSON.stringify({
    answer: `Rencana belum terverifikasi [${old.id}]`, citationIds: [old.id],
  }), next), /citation_not_retrieved/);
});
