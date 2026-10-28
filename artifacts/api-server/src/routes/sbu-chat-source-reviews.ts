import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { ListKnowledgeSourcesResponse, ListSbuChatSourceReviewsResponse, RecordSbuChatSourceReviewBody, RecordSbuChatSourceReviewResponse } from "@workspace/api-zod";
import { chatSourceReviewStore, InvalidSourceReview, SourceReviewConflict, type ChatSourceReviewStore } from "../lib/sbu-chat-source-reviews";
import { knowledgePdf } from "../lib/knowledge-pdf-manifest";
import { createKnowledgePdfRouter } from "./knowledge-pdf";

const SOURCE_CLASSIFICATIONS: Record<string, { sourceRole: "primer" | "panduan" | "praktik"; topics: string[] }> = {
  "permen-pu-6-2025": { sourceRole: "primer", topics: ["Perizinan", "SMAP", "Transisi SBU"] },
  "kepdirjen-281-2026": { sourceRole: "primer", topics: ["Skema sertifikasi", "SMAP", "Transisi SBU"] },
  "teras-lpjk-12-konversi": { sourceRole: "panduan", topics: ["TERAS LPJK", "Transisi SBU", "Persiapan dokumen", "SMAP"] },
  "teras-lpjk-12-sistem": { sourceRole: "panduan", topics: ["TERAS LPJK", "Kesiapan sistem", "Transisi SBU"] },
  "teras-lpjk-12-pelaku-usaha": { sourceRole: "praktik", topics: ["TERAS LPJK", "Pendampingan", "SMAP", "PUB", "LKUT"] },
};

// Operations-only API: a selected chat role/profile never grants review rights.
export function createChatSourceReviewsRouter(store: ChatSourceReviewStore = chatSourceReviewStore): IRouter {
  const router = Router();
  router.use(createKnowledgePdfRouter(store));
  // Public-source excerpts for signed-in readers, not the reviewer-only ledger.
  // Reuse active() so withdrawals/replacements also affect this view. No AI,
  // company data, reviewer identities or decision reasons are returned.
  router.get("/knowledge-sources", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Silakan masuk untuk melanjutkan." }); return; }
    if (req.get("X-SBU-Form-Owner") !== userId) {
      res.status(409).json({ error: "Sesi berubah. Muat ulang Pusat Pengetahuan." }); return;
    }
    try {
      const versions = await store.active();
      const sources = versions.flatMap(version => {
        // Only classify sources whose origin is known. A future catalog must
        // explicitly classify new documents instead of silently calling them law.
        const classification = SOURCE_CLASSIFICATIONS[version.sourceKey];
        if (!classification) {
          throw new Error("unclassified_source");
        }
        return version.citations.map(citation => ({
        ...citation, sourceKey: version.sourceKey, versionId: version.versionId,
        ...classification,
        pdf: knowledgePdf(version.sourceKey, version.versionId, citation.id)?.metadata,
        }));
      });
      res.json(ListKnowledgeSourcesResponse.parse(sources));
    } catch {
      res.status(503).json({ error: "Status sumber belum dapat diperiksa. Coba muat ulang." });
    }
  });
  router.use("/openai/sbu/source-reviews", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Silakan masuk untuk melanjutkan." }); return; }
    if (req.get("X-SBU-Form-Owner") !== userId) {
      res.status(409).json({ error: "Sesi berubah. Muat ulang sebelum menelaah sumber." }); return;
    }
    const reviewers = (process.env.SBU_VERIFIER_USER_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
    if (!reviewers.includes(userId)) {
      res.status(403).json({ error: "Hanya penelaah sumber resmi yang diizinkan." }); return;
    }
    next();
  });
  router.get("/openai/sbu/source-reviews", async (_req, res) => {
    try { res.json(ListSbuChatSourceReviewsResponse.parse(await store.read())); }
    catch { res.status(503).json({ error: "Riwayat telaah sumber belum dapat dibaca." }); }
  });
  router.post("/openai/sbu/source-reviews", async (req, res) => {
    const input = RecordSbuChatSourceReviewBody.safeParse(req.body);
    // Do not accept server-owned actor/time, arbitrary source text, or hidden flags.
    const fields = ["sourceKey", "versionId", "expectedRevision", "status", "reason", "reviewReference"];
    if (!input.success || Object.keys(req.body).some(key => !fields.includes(key)) ||
        !input.data.reason.trim() || !input.data.reviewReference.trim()) {
      res.status(400).json({ error: "Keputusan dan rujukan telaah sumber wajib lengkap." }); return;
    }
    try {
      const decision = await store.record(input.data, getAuth(req).userId!);
      res.status(201).json(RecordSbuChatSourceReviewResponse.parse(decision));
    } catch (error) {
      if (error instanceof SourceReviewConflict) {
        res.status(409).json({ error: "Versi keputusan berubah. Baca ulang riwayat dan telaah sebelum mengirim keputusan baru." });
      } else if (error instanceof InvalidSourceReview) {
        res.status(400).json({ error: "Sumber/versi tidak tersedia dalam katalog terkurasi atau bukan versi saat ini." });
      } else {
        res.status(503).json({ error: "Keputusan telaah belum dapat dicatat. Baca ulang riwayat sebelum mencoba lagi." });
      }
    }
  });
  return router;
}
