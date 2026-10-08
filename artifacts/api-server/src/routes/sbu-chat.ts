import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { GetSbuChatSpecialistsResponse, SendSbuChatMessageBody, SendSbuChatMessageResponse } from "@workspace/api-zod";
import { CHAT_DISCLAIMER, sbuChatSystemPrompt, type ChatMode } from "../lib/sbu-chat-policy";
import { specialistCatalog, type SpecialistId } from "../lib/sbu-chat-specialists";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Generate = (mode: ChatMode, messages: ChatMessage[], signal: AbortSignal, specialist: SpecialistId) => Promise<string>;

const generate: Generate = async (mode, messages, signal, specialist) => {
  // Keep unrelated auth/case routes working when AI is not provisioned in a test environment.
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const reply = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 8192,
    messages: [{ role: "system", content: sbuChatSystemPrompt(mode, specialist) }, ...messages],
  }, { signal, timeout: 65_000, maxRetries: 1 });
  const answer = reply.choices[0]?.message?.content?.trim();
  if (!answer) throw new Error("empty_ai_response");
  return answer;
};

// No company, case, file or conversation database is read or written.
// The temporary limits are instance-local, not a substitute for a shared billing quota.
export function createSbuChatRouter(answer: Generate = generate): IRouter {
  const router: IRouter = Router();
  const slots = new Map<string, { since: number; count: number; busy: boolean }>();
  router.get("/openai/sbu/specialists", (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!getAuth(req).userId) {
      res.status(401).json({ error: "Silakan masuk untuk melihat spesialis." }); return;
    }
    res.json(GetSbuChatSpecialistsResponse.parse(specialistCatalog()));
  });
  router.post("/openai/sbu/messages", async (req, res): Promise<void> => {
    res.set("Cache-Control", "private, no-store");
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Silakan masuk untuk menggunakan asisten." }); return;
    }
    if (req.get("X-SBU-Form-Owner") !== userId) {
      res.status(409).json({ error: "Sesi berubah. Muat ulang halaman sebelum mengirim pesan." }); return;
    }
    const input = SendSbuChatMessageBody.safeParse(req.body);
    if (!input.success || input.data.consent !== true) {
      res.status(400).json({ error: "Pilih mode, isi percakapan yang sah, dan setujui pengiriman teks ke penyedia AI." }); return;
    }
    const messages = input.data.messages.map((message) => ({ ...message, content: message.content.trim() }));
    if (messages[0]?.role !== "user" || messages.at(-1)?.role !== "user" ||
        messages.some((message, i) => !message.content ||
          (message.role === "user" && message.content.length > 4000) ||
          (i > 0 && message.role === messages[i - 1].role)) ||
        messages.reduce((sum, message) => sum + message.content.length, 0) > 40000) {
      res.status(400).json({ error: "Percakapan tidak valid atau terlalu panjang. Mulai percakapan baru; pesan maksimal 4.000 karakter." }); return;
    }
    const now = Date.now();
    for (const [id, slot] of slots) if (!slot.busy && now - slot.since >= 60000) slots.delete(id);
    let slot = slots.get(userId);
    if (!slot) {
      if (slots.size >= 1000) {
        res.status(503).json({ error: "Asisten sedang sibuk. Coba lagi sebentar." }); return;
      }
      slot = { since: now, count: 0, busy: false };
      slots.set(userId, slot);
    } else if (!slot.busy && now - slot.since >= 60000) {
      slot.since = now; slot.count = 0;
    }
    if (slot.busy || slot.count >= 6) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "Tunggu jawaban sebelumnya atau coba kembali dalam satu menit." }); return;
    }
    slot.count++; slot.busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    try {
      // Promise race also bounds adapters which fail to honor cancellation.
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("ai_cancelled")), { once: true });
      });
      const text = await Promise.race([answer(input.data.mode, messages, controller.signal, input.data.specialist), aborted]);
      if (!text.trim()) throw new Error("empty_ai_response");
      if (!res.destroyed) res.json(SendSbuChatMessageResponse.parse({
        userId, mode: input.data.mode, specialist: input.data.specialist, answer: text, disclaimer: CHAT_DISCLAIMER,
      }));
    } catch {
      // Never log private prompts, raw provider errors, credentials or response bodies.
      if (!res.destroyed) res.status(503).json({
        error: "Jawaban AI belum tersedia. Teks percakapan tidak disimpan di aplikasi; coba lagi atau mulai percakapan baru.",
      });
    } finally {
      clearTimeout(timer);
      res.off("close", disconnect);
      slot.busy = false;
    }
  });
  return router;
}

export default createSbuChatRouter();
