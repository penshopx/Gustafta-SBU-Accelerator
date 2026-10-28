import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "bs-pilot-"));
after(() => rm(temp, { recursive: true, force: true }));
for (const [name, path] of [
  ["bs", "../src/lib/sbu-chat-bs-schemes.ts"],
  ["schemes", "../src/lib/sbu-chat-schemes.ts"],
  ["retrieval", "../src/lib/sbu-chat-retrieval.ts"],
  ["ui", "../../gustafta-sbu/src/lib/sbu-chat-schemes.ts"],
]) await build({ entryPoints: [new URL(path, import.meta.url).pathname],
  outfile: join(temp, `${name}.mjs`), bundle: true, platform: "node", format: "esm" });
const { BS_SCHEME_CATALOG, BS_SOURCE_VERSIONS } = await import(join(temp, "bs.mjs"));
const { schemeSources, schemeInstruction, BG_SOURCE_VERSIONS } = await import(join(temp, "schemes.mjs"));
const { retrieveChatSources, validateCitedAnswer } = await import(join(temp, "retrieval.mjs"));
const { BS_SCHEMES } = await import(join(temp, "ui.mjs"));
const kbli = ["42101","42102","42103","42201","42202","42203","42204","42205","42206","42911","42912","42913","42991","42992","42993","42994","42999","42995","42996","42209"];
const pdf = ["576","576","576","577","577–578","578","578","578","578","579","579–580","580","581","581","581","581","582","581–582","582","579"];
const all = [...BG_SOURCE_VERSIONS, ...BS_SOURCE_VERSIONS];

test("frontend choices and server catalog agree on every BS code, title and KBLI", () => {
  assert.deepEqual(BS_SCHEMES.map(row => [row.id, row.kbli, row.title]),
    BS_SCHEME_CATALOG.map(row => [row.code, row.kbli, row.title]));
});

test("twenty BS mappings and PDF/cetak locators match the reviewed, nonsequential source table", () => {
  assert.equal(BS_SCHEME_CATALOG.length, 20);
  for (const [i, row] of BS_SCHEME_CATALOG.entries()) {
    assert.equal(row.code, `BS${String(i + 1).padStart(3, "0")}`);
    assert.equal(row.kbli, kbli[i]);
    assert.equal(row.pdf, pdf[i]);
    assert.equal(row.printed, pdf[i].split("–").map(p => Number(p) - 16).join("–"));
    const sources = schemeSources(row.code, all);
    assert.equal(sources.length, 2);
    assert.match(sources[0].locator, new RegExp(`PDF hlm. ${i < 5 ? 21 : i < 18 ? 22 : 23}, cetak ${i < 5 ? 7 : i < 18 ? 8 : 9}`));
    for (const c of sources) {
      assert.match(c.excerpt, new RegExp(row.kbli));
      assert.equal(c.verificationStatus, "unverified");
      assert.match(c.version, /SHA-256 [a-f0-9]{64}/);
      assert.match(c.limitation, /bukan PDF unggahan/);
    }
  }
});

test("BS018 preserves the exclusion on the continuation page, not a catch-all manufacturing claim", () => {
  const scope = schemeSources("BS018", all)[1];
  assert.match(scope.locator, /581–582.*565–566/);
  assert.match(scope.excerpt, /tidak mencakup.*radiasi pengion.*42997/);
  assert.match(schemeSources("BS003", all)[1].excerpt, /tidak mencakup konstruksi jembatan rel/);
});

test("no pilot sources leak into generic retrieval or cross-family citation validation", () => {
  assert.deepEqual(retrieveChatSources("BS018 42995 fasilitas pengolahan", all), []);
  const bs = schemeSources("BS020", all);
  const bg = schemeSources("BG001", all);
  assert.throws(() => validateCitedAnswer(JSON.stringify({
    answer: `Sumber lain [${bg[0].id}]`, citationIds: [bg[0].id],
  }), bs), /citation_not_retrieved/);
  assert.deepEqual(schemeSources("BS020", BG_SOURCE_VERSIONS), []);
  assert.equal(schemeSources("BG001", all).length, 2);
});

test("BS instructions preserve missing-context questions and do not authorize criteria or old KBLI rules", () => {
  const instruction = schemeInstruction("BS020");
  assert.match(instruction, /PILOT BS.*BS020.*42209/);
  assert.match(instruction, /tanyakan konteks yang kurang/);
  assert.match(instruction, /Jangan mengarang angka, SKK, alat atau pengalaman/);
  assert.match(instruction, /Tidak mengesahkan berkas atau mengubah penilaian/);
});
