import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { GetSbuChatBudgetResponse, GetSbuChatQuotaResponse, GetSbuChatSpecialistsResponse, SendSbuChatMessageBody, SendSbuChatMessageResponse } from "@workspace/api-zod";
import type { SbuChatCitation } from "@workspace/api-zod";
import { chatQuotaStore, type ChatQuotaStore, type ChatLimitCode } from "../lib/sbu-chat-quota";
import { CHAT_DISCLAIMER } from "../lib/sbu-chat-policy";
import { specialistCatalog } from "../lib/sbu-chat-specialists";
import { retrieveChatSources, validateCitedAnswer, RETRIEVAL_NOTICE } from "../lib/sbu-chat-retrieval";
import { chatSourceReviewStore, type ChatSourceReviewStore } from "../lib/sbu-chat-source-reviews";
import { createChatSourceReviewsRouter } from "./sbu-chat-source-reviews";
import { AiBudgetError, reserveAiBudget, type ReserveAiBudget } from "../lib/ai-budget";
import { BUDGET_MODEL, BUDGET_OUTPUT_TOKENS } from "../lib/ai-budget-policy";
import { readAiBudgetAvailability, type ReadAiBudgetAvailability } from "../lib/ai-budget-availability";
import {
  buildSbuChatInput, createAnthropicSbuChatGenerate, sbuChatInputSize,
  SBU_CHAT_MODEL, SBU_CHAT_MAX_INPUT_BYTES, type SbuChatGenerate,
} from "../lib/sbu-chat-harness";
import { prepareChatAnalysis, readChatAnalysis, ChatAnalysisError, CHAT_ANALYSIS_ERROR, type ReadChatAnalysis } from "../lib/sbu-chat-analysis";
import { schemeSources } from "../lib/sbu-chat-schemes";

const SCHEME_NOTICE = "Pilot BG: ringkasan pemetaan subklasifikasi dan ruang lingkup dari salinan skema LSBU Konstruksi Indonesia dan KBLI 2025. Bukan dokumen lengkap, persyaratan terverifikasi, verifikasi live, atau keputusan sertifikasi. Tautan sumber adalah kanal rujukan, bukan PDF unggahan; halaman PDF/cetak tercantum pada kartu.";

type Generate = SbuChatGenerate;

export const generateSbuChatAnswer: Generate = async (...args) => {
  // Legacy GPT adapter remains the default for Klinik Konsultasi.
  const [mode, messages, signal, specialist, context = "", sources, _maxRetries, purpose, scheme] = args;
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const chatInput = buildSbuChatInput(mode, messages, specialist, context, sources, purpose, scheme);
  const reply = await openai.chat.completions.create({
    model: BUDGET_MODEL,
    max_completion_tokens: BUDGET_OUTPUT_TOKENS,
    ...(sources ? { response_format: { type: "json_object" as const } } : {}),
    messages: [{ role: "system", content: chatInput.system }, ...chatInput.messages],
  }, { signal, timeout: 65_000, maxRetries: 0 });
  const answer = reply.choices[0]?.message?.content?.trim();
  if (!answer) throw new Error("empty_ai_response");
  return answer;
};

export const generateClaudeAssistantAnswer: Generate = async (...args) => {
  // Lazy import keeps non-AI routes/test fixtures independent from provider credentials.
  const { anthropic } = await import("@workspace/integrations-anthropic-ai");
  return createAnthropicSbuChatGenerate(anthropic)(...args);
};

// Only aggregate usage metadata is persisted, never the conversation.
export function createSbuChatRouter(answer: Generate = generateClaudeAssistantAnswer, quotas: ChatQuotaStore = chatQuotaStore, reviews: ChatSourceReviewStore = chatSourceReviewStore, reserveBudget: ReserveAiBudget = reserveAiBudget, readBudget: ReadAiBudgetAvailability = readAiBudgetAvailability, readAnalysis: ReadChatAnalysis = readChatAnalysis): IRouter {
  const router: IRouter = Router();
  router.use(createChatSourceReviewsRouter(reviews));
  router.get("/openai/sbu/budget", async (req, res): Promise<void> => {
    res.set("Cache-Control", "private, no-store");
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Silakan masuk untuk memeriksa anggaran asisten." }); return;
    }
    if (req.get("X-SBU-Form-Owner") !== userId) {
      res.status(409).json({ error: "Sesi berubah. Muat ulang halaman sebelum memeriksa anggaran." }); return;
    }
    try {
      res.json(GetSbuChatBudgetResponse.parse({ ...await readBudget("assistant", SBU_CHAT_MODEL), userId }));
    } catch {
      res.json(GetSbuChatBudgetResponse.parse({
        userId, status: "unavailable", checkedAt: new Date().toISOString(), nextResetAt: null,
      }));
    }
  });
  router.get("/openai/sbu/quota", async (req, res): Promise<void> => {
    res.set("Cache-Control", "private, no-store");
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Silakan masuk untuk melihat kuota asisten." }); return;
    }
    if (req.get("X-SBU-Form-Owner") !== userId) {
      res.status(409).json({ error: "Sesi berubah. Muat ulang halaman sebelum memeriksa kuota." }); return;
    }
    try {
      res.json(GetSbuChatQuotaResponse.parse(await quotas.read(userId)));
    } catch {
      res.status(503).json({ error: "Kuota belum dapat diperiksa. Pengiriman AI dinonaktifkan sementara; coba lagi nanti." });
    }
  });
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
      res.status(400).json({ error: "Muat ulang halaman, pilih mode, isi percakapan yang sah, dan setujui pengiriman teks ke Claude Sonnet 5.5 melalui Replit AI Integrations." }); return;
    }
    const purpose = input.data.purpose ?? "tutor_regulasi";
    const analysisContext = input.data.analysisContext;
    const scheme = input.data.scheme;
    if (scheme && (analysisContext || purpose === "pemeriksa_dokumen")) {
      res.status(400).json({ error: "Pilot skema tidak membaca dokumen privat. Lepas konteks skema untuk menggunakan Pemeriksa Dokumen." }); return;
    }
    if (analysisContext && purpose !== "pemeriksa_dokumen") {
      res.status(400).json({ error: "Hasil Bedah Dokumen hanya dapat dipilih pada tujuan Pemeriksa Dokumen." }); return;
    }
    const messages = input.data.messages.map((message) => ({ ...message, content: message.content.trim() }));
    if (messages[0]?.role !== "user" || messages.at(-1)?.role !== "user" ||
        messages.some((message, i) => !message.content ||
          (message.role === "user" && message.content.length > 4000) ||
          (i > 0 && message.role === messages[i - 1].role)) ||
        messages.reduce((sum, message) => sum + message.content.length, 0) > 40000) {
      res.status(400).json({ error: "Percakapan tidak valid atau terlalu panjang. Mulai percakapan baru; pesan maksimal 4.000 karakter." }); return;
    }
    let selectedContext = "";
    if (analysisContext) {
      try {
        selectedContext = await prepareChatAnalysis(analysisContext, userId, readAnalysis);
      } catch (error) {
        const status = error instanceof ChatAnalysisError ? error.status : 503;
        res.status(status).json({ error: CHAT_ANALYSIS_ERROR, code: status === 409 ? "chat_analysis_changed" : "chat_analysis_unavailable" });
        return;
      }
    }
    let sources: SbuChatCitation[];
    try {
      const active = await reviews.active();
      sources = scheme ? schemeSources(scheme, active) : retrieveChatSources(messages.at(-1)!.content, active);
    } catch {
      res.status(503).json({ error: "Status persetujuan sumber belum dapat diperiksa. Tidak ada permintaan AI yang dikirim." });
      return;
    }
    if (scheme && sources.length !== 2) {
      res.status(503).json({ error: "Sumber pilot skema tidak lengkap atau telah dicabut. Tidak ada permintaan AI yang dikirim." }); return;
    }
    const chatInput = buildSbuChatInput(input.data.mode, messages, input.data.specialist, selectedContext, sources, purpose, scheme);
    if (sbuChatInputSize(chatInput) > SBU_CHAT_MAX_INPUT_BYTES) {
      res.status(400).json({ error: "Percakapan terlalu panjang untuk batas input asisten. Mulai percakapan baru." });
      return;
    }
    let reservation;
    try { reservation = await quotas.reserve(userId); } catch {
      res.status(503).json({ error: "Kuota belum dapat diperiksa. Tidak ada permintaan AI yang dikirim; coba lagi nanti." }); return;
    }
    if (reservation.code) {
      const explanations: Record<ChatLimitCode, string> = {
        chat_busy: "Masih ada permintaan asisten berjalan pada akun Anda. Tunggu sampai selesai.",
        chat_minute_limit: "Batas enam percobaan per menit tercapai. Coba lagi setelah menit berganti.",
        chat_daily_limit: "Kuota asisten harian habis. Kuota direset setiap pukul 07.00 WIB.",
      };
      res.set("Retry-After", String(reservation.quota.retryAfterSeconds));
      res.status(429).json({ error: explanations[reservation.code], code: reservation.code, quota: reservation.quota }); return;
    }
    if (res.destroyed) {
      // The client may disconnect while waiting for the database lock.
      await quotas.finish(userId, reservation.leaseId).catch(() => {});
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    let payload;
    let budgetError: AiBudgetError | undefined;
    let analysisError: ChatAnalysisError | undefined;
    let generationSettled = false;
    try {
      await reserveBudget("assistant", SBU_CHAT_MODEL);
      controller.signal.throwIfAborted();
      // Promise race also bounds adapters which fail to honor cancellation.
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("ai_cancelled")), { once: true });
      });
      const generation = answer(input.data.mode, messages, controller.signal, input.data.specialist, selectedContext, sources, 0, purpose, scheme)
        .then((text) => { generationSettled = true; return text; },
          (error: unknown) => { generationSettled = true; throw error; });
      const text = await Promise.race([generation, aborted]);
      if (analysisContext && await prepareChatAnalysis(analysisContext, userId, readAnalysis) !== selectedContext) {
        throw new ChatAnalysisError(409);
      }
      // A withdrawal/replacement committed while the provider was running must
      // not leak an answer based on its now-retired context, even with no markers.
      const active = await reviews.active();
      const current = scheme ? schemeSources(scheme, active) : retrieveChatSources(messages.at(-1)!.content, active);
      if (sources.some(source => !current.some(item => item.id === source.id))) {
        throw new Error("retrieved_source_retired");
      }
      const cited = validateCitedAnswer(text, sources);
      payload = {
        userId, mode: input.data.mode, specialist: input.data.specialist, purpose,
        ...(scheme ? { scheme } : {}),
        ...(analysisContext ? { analysisContext } : {}), ...cited,
        disclaimer: CHAT_DISCLAIMER, retrievalNotice: scheme ? SCHEME_NOTICE : RETRIEVAL_NOTICE,
      };
    } catch (error) {
      if (error instanceof AiBudgetError) budgetError = error;
      if (error instanceof ChatAnalysisError) analysisError = error;
      // Never log private prompts, raw provider errors, credentials or response bodies.
    } finally {
      clearTimeout(timer);
      res.off("close", disconnect);
    }
    let quota;
    try {
      // An adapter may ignore cancellation. Keep its lease until expiry instead
      // of allowing another instance to start a concurrent billable attempt.
      quota = controller.signal.aborted && !generationSettled
        ? await quotas.read(userId)
        : await quotas.finish(userId, reservation.leaseId);
    } catch {
      if (!res.destroyed) res.status(503).json({ error: "Status kuota belum dapat diperbarui. Percobaan tetap dihitung; tunggu dua menit sebelum mencoba kembali." });
      return;
    }
    if (res.destroyed) return;
    if (budgetError) {
      res.status(503).json({ error: budgetError.message, code: budgetError.code, quota });
      return;
    }
    if (analysisError) {
      res.status(analysisError.status).json({
        error: `${CHAT_ANALYSIS_ERROR} Percobaan yang telah dikirim ke AI tetap memakai kuota.`,
        code: analysisError.status === 409 ? "chat_analysis_changed" : "chat_analysis_unavailable", quota,
      });
      return;
    }
    if (payload) res.json(SendSbuChatMessageResponse.parse({ ...payload, quota }));
    else res.status(503).json({
      error: "Jawaban AI atau kutipannya belum dapat divalidasi. Percobaan tetap memakai kuota karena sudah dikirim ke AI. Teks percakapan tidak disimpan di aplikasi.",
      quota,
    });
  });
  return router;
}

export default createSbuChatRouter();
