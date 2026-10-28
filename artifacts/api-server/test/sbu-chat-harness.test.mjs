import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";

const dir = fileURLToPath(new URL(".", import.meta.url));
const temp = await mkdtemp(join(dir, ".chat-harness-"));
try {
  await build({
    entryPoints: [join(dir, "../src/lib/sbu-chat-harness.ts")],
    outfile: join(temp, "harness.mjs"), platform: "node", bundle: true, format: "esm",
  });
  const { createAnthropicSbuChatGenerate, buildSbuChatInput, sbuChatInputSize,
    SBU_CHAT_MODEL, SBU_CHAT_MAX_INPUT_BYTES } = await import(join(temp, "harness.mjs"));

  test("BG pilot scope reaches the actual provider system prompt without private context", async () => {
    let payload;
    const generate = createAnthropicSbuChatGenerate({ messages: { create: async params => {
      payload = params;
      return { content: [{ type: "text", text: '{"answer":"Belum terverifikasi.","citationIds":[]}' }], stop_reason: "end_turn" };
    } } });
    await generate("asesor", [{ role: "user", content: "Apa ruang lingkupnya?" }], new AbortController().signal, "skemaclaw", "", [], 0, "tutor_regulasi", "BG001");
    assert.match(payload.system, /PILOT BG.*BG001/);
    assert.match(payload.system, /Jangan mengarang angka, SKK, alat atau pengalaman/);
    assert.doesNotMatch(payload.system, /KONSULTASI PRIVAT:/);
  });

  test("fixed chat harness sends the consented prompt to Sonnet with bounded retries and output", async () => {
    const signal = new AbortController().signal;
    const calls = [];
    const client = { messages: { create: async (params, options) => {
      calls.push({ params, options });
      return { content: [{ type: "text", text: '{"answer":"Periksa sumber resmi.","citationIds":[]}' }], stop_reason: "end_turn" };
    } } };
    const generate = createAnthropicSbuChatGenerate(client);
    const messages = [{ role: "user", content: "Bantu persiapan SBU" }];
    const text = await generate("bujk", messages, signal, "sbuclaw", "", []);

    assert.equal(text, '{"answer":"Periksa sumber resmi.","citationIds":[]}');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.model, "claude-sonnet-5-5");
    assert.equal(calls[0].params.max_tokens, 8192);
    assert.deepEqual(calls[0].params.messages, messages);
    assert.match(calls[0].params.system, /Keluarkan JSON saja/);
    assert.equal(calls[0].options.signal, signal);
    assert.equal(calls[0].options.timeout, 65_000);
    assert.equal(calls[0].options.maxRetries, 0);
    assert.equal(SBU_CHAT_MODEL, "claude-sonnet-5-5");
    assert.equal(SBU_CHAT_MAX_INPUT_BYTES, 150_000);
  });

  test("local input size guard includes UTF-8 system and conversation text, not billing tokens", () => {
    const input = buildSbuChatInput("bujk", [{ role: "user", content: "SBU 建設" }], "sbuclaw", "", []);
    const bound = sbuChatInputSize(input);
    const textBytes = Buffer.byteLength(input.system, "utf8") + Buffer.byteLength("SBU 建設", "utf8");
    assert.ok(bound >= textBytes + 32 + 256);
    assert.ok(bound <= SBU_CHAT_MAX_INPUT_BYTES);
  });

  test("six goals change the real provider instructions independently of role and specialist", async () => {
    const goals = {
      tutor_regulasi: /penjelasan sederhana; rujukan dan locator/,
      permohonan_baru: /apakah baru pertama bersertifikat/,
      perpanjangan: /Jangan menolak perpanjangan otomatis/,
      pemeriksa_dokumen: /Jika belum ada cuplikan/,
      studi_kasus: /Contoh hipotetis harus berlabel hipotetis/,
      pendamping_proses: /Tidak menyimpan tugas, mengubah penilaian/,
    };
    const calls = [];
    const generate = createAnthropicSbuChatGenerate({ messages: { create: async (params) => {
      calls.push(params);
      return { content: [{ type: "text", text: '{"answer":"Draf","citationIds":[]}' }], stop_reason: "end_turn" };
    } } });
    for (const [goal, expected] of Object.entries(goals)) {
      await generate("pendamping", [{ role: "user", content: "Pertanyaan anonim" }],
        new AbortController().signal, "sbuclaw", "", [], 0, goal);
      const prompt = calls.at(-1).system;
      assert.match(prompt, expected);
      assert.match(prompt, new RegExp(`TUJUAN PERCAKAPAN — ${goal}:`));
      assert.match(prompt, /Pendamping\/fasilitator\/konsultan/);
      assert.match(prompt, /tidak memberikan hak akses/);
      assert.match(prompt, /Keluarkan JSON saja/);
      assert.match(prompt, /Draf matriks BG001 bukan hasil retrieval/);
    }
    assert.equal(new Set(calls.map(call => call.system)).size, 6);
    const legacyConsultation = buildSbuChatInput("pendamping", [], "sbuclaw", "Cuplikan terpilih", []);
    assert.doesNotMatch(legacyConsultation.system, /TUJUAN PERCAKAPAN —/);
    assert.match(legacyConsultation.system, /Cuplikan terpilih/);
  });

  test("truncated provider output is rejected instead of returning incomplete JSON", async () => {
    const generate = createAnthropicSbuChatGenerate({ messages: { create: async () => ({
      content: [{ type: "text", text: '{"answer":"partial' }], stop_reason: "max_tokens",
    }) } });
    await assert.rejects(generate("bujk", [{ role: "user", content: "Question" }],
      new AbortController().signal, "sbuclaw"), /chat_output_limit/);
  });
} finally {
  await rm(temp, { recursive: true, force: true });
}
