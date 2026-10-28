import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "bg-pilot-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  entryPoints: [new URL("../src/lib/sbu-chat-schemes.ts", import.meta.url).pathname],
  outfile: join(temp, "schemes.mjs"), bundle: true, platform: "node", format: "esm",
});
const { BG_SCHEME_CATALOG, BG_SOURCE_VERSIONS, schemeSources, schemeInstruction } = await import(join(temp, "schemes.mjs"));

test("nine BG codes have matching scoped sources, immutable versions and explicit limits", () => {
  assert.equal(BG_SCHEME_CATALOG.length, 9);
  assert.equal(new Set(BG_SCHEME_CATALOG.map(r => r.code)).size, 9);
  for (const [i, row] of BG_SCHEME_CATALOG.entries()) {
    assert.equal(row.kbli, `4101${i + 1}`);
    const sources = schemeSources(row.code, BG_SOURCE_VERSIONS);
    assert.equal(sources.length, 2);
    assert.ok(sources.every(s => s.id.startsWith(`${row.code.toLowerCase()}-`)));
    for (const source of sources) {
      assert.equal(source.verificationStatus, "unverified");
      assert.match(source.locator, /PDF hlm\..*cetak/);
      assert.match(source.version, /SHA-256 [a-f0-9]{64}/);
      assert.match(source.limitation, /Tidak mengaktifkan draf penilaian BG001/);
      assert.match(source.excerpt, new RegExp(row.kbli));
    }
  }
  assert.match(schemeSources("BG009", BG_SOURCE_VERSIONS)[1].locator, /574–575.*558–559/);
});

test("withdrawal cannot fall back to the bundled catalog or another scheme", () => {
  assert.deepEqual(schemeSources("BG001", []), []);
  assert.equal(schemeSources("BG001", BG_SOURCE_VERSIONS.slice(0, 1)).length, 1);
  const replaced = BG_SOURCE_VERSIONS.map(v => ({ ...v, citations: v.citations.filter(c => !c.id.startsWith("bg001-")) }));
  assert.deepEqual(schemeSources("BG001", replaced), []);
});

test("pilot instructions request clarification and never authorize hidden documents or criteria", () => {
  assert.equal(schemeInstruction(), "");
  assert.throws(() => schemeInstruction("IN001"), /invalid_scheme/);
  const prompt = schemeInstruction("BG001");
  assert.match(prompt, /BG001.*41011/);
  assert.match(prompt, /tanyakan konteks yang kurang/);
  assert.match(prompt, /Jangan mengarang angka, SKK, alat atau pengalaman/);
  assert.match(prompt, /jangan membawa sumber percakapan lama/);
});
