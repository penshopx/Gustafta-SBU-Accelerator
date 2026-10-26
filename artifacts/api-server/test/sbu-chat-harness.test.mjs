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
  const { createAnthropicSbuChatGenerate, buildSbuChatInput, estimateSbuChatInputTokens,
    SBU_CHAT_MODEL, SBU_CHAT_MAX_INPUT_TOKENS } = await import(join(temp, "harness.mjs"));

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
    assert.equal(SBU_CHAT_MAX_INPUT_TOKENS, 150_000);
  });

  test("input reservation bound includes UTF-8 system and conversation text", () => {
    const input = buildSbuChatInput("bujk", [{ role: "user", content: "SBU 建設" }], "sbuclaw", "", []);
    const bound = estimateSbuChatInputTokens(input);
    const textBytes = Buffer.byteLength(input.system, "utf8") + Buffer.byteLength("SBU 建設", "utf8");
    assert.ok(bound >= textBytes + 32 + 256);
    assert.ok(bound <= SBU_CHAT_MAX_INPUT_TOKENS);
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
