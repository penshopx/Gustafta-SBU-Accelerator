import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { chatSourceReviewStore, type ChatSourceReviewStore } from "../lib/sbu-chat-source-reviews";
import { knowledgePdf } from "../lib/knowledge-pdf-manifest";
import type { knowledgePdfStorage } from "../lib/knowledge-pdf-storage";

function untilAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("knowledge_pdf_cancelled"));
    if (signal.aborted) { pending.catch(() => {}); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

// Lazy storage import keeps unrelated route tests and requests storage-free.
export function createKnowledgePdfRouter(
  store: ChatSourceReviewStore = chatSourceReviewStore,
  archive?: Pick<typeof knowledgePdfStorage, "read">,
): IRouter {
  const router = Router();
  router.get("/knowledge-sources/:citationId/pdf", async (req, res) => {
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie, Authorization, X-SBU-Form-Owner" });
    const owner = getAuth(req).userId;
    if (!owner) { res.status(401).json({ error: "Silakan masuk untuk membuka PDF." }); return; }
    if (req.get("X-SBU-Form-Owner") !== owner) {
      res.status(409).json({ error: "Sesi berubah. Muat ulang Pusat Pengetahuan." }); return;
    }
    const id = req.params.citationId;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const closed = () => controller.abort();
    res.once("close", closed);
    const find = async () => (await untilAbort(store.active(), controller.signal)).find(v => v.citations.some(c => c.id === id));
    try {
      const version = await find();
      const selected = version && knowledgePdf(version.sourceKey, version.versionId, id);
      if (!selected) { res.status(404).json({ error: "PDF asli tidak tersedia untuk sumber/versi aktif ini." }); return; }
      const storage = archive ?? (await import("../lib/knowledge-pdf-storage")).knowledgePdfStorage;
      const bytes = await untilAbort(storage.read(selected.file, controller.signal), controller.signal);
      // Recheck after IO: a withdrawal during the read must not release bytes.
      const current = await find();
      if (!current || current.sourceKey !== version.sourceKey || current.versionId !== version.versionId) {
        res.status(404).json({ error: "Sumber telah berubah atau dicabut. Muat ulang daftar." }); return;
      }
      controller.signal.throwIfAborted();
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${selected.metadata.filename}"` });
      res.send(bytes);
    } catch {
      if (!res.destroyed && !res.headersSent) res.status(503).json({ error: "PDF belum dapat dibuka. Coba lagi; tidak ada berkas parsial yang dikirim." });
    } finally {
      clearTimeout(timer);
      res.removeListener("close", closed);
    }
  });
  return router;
}
