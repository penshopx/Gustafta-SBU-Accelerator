import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { GetRuangSimpanCompanyProfileResponse } from "@workspace/api-zod";
import { fetchRuangSimpanProfile, type ConnectionResult } from "../lib/ruang-simpan";

const router: IRouter = Router();

router.get("/ruang-simpan/company-profile", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");

  let userId: string | null | undefined;
  try {
    userId = getAuth(req).userId;
  } catch {
    userId = null;
  }
  if (!userId) {
    res.status(401).json({ error: "Autentikasi diperlukan", code: "unauthenticated" });
    return;
  }

  if (req.originalUrl.includes("?") || Object.keys(req.query).length > 0 ||
    req.body !== undefined ||
    (Number(req.headers["content-length"] ?? 0) > 0) ||
    req.headers["transfer-encoding"] !== undefined) {
    res.status(400).json({ error: "Parameter kueri dan isi permintaan tidak diperbolehkan", code: "invalid_request" });
    return;
  }

  const upstreamAbortController = new AbortController();
  const abortForClientDisconnect = () => {
    if (!res.writableEnded) upstreamAbortController.abort();
  };
  if (res.destroyed && !res.writableEnded) upstreamAbortController.abort();
  res.once("close", abortForClientDisconnect);
  let result: ConnectionResult;
  try {
    result = await fetchRuangSimpanProfile(userId, upstreamAbortController.signal);
  } finally {
    res.removeListener("close", abortForClientDisconnect);
  }
  if (upstreamAbortController.signal.aborted) return;

  switch (result.kind) {
    case "unmapped":
      res.status(404).json({ error: "Koneksi Ruang Simpan belum dikonfigurasi", code: "connection_not_configured" });
      return;
    case "unavailable":
      res.status(503).json({ error: "Koneksi Ruang Simpan tidak tersedia", code: "connection_unavailable" });
      return;
    case "invalid":
      res.status(424).json({ error: "Kredensial koneksi Ruang Simpan tidak valid", code: "connection_invalid" });
      return;
    case "insufficient_scope":
      res.status(424).json({ error: "Koneksi Ruang Simpan tidak memiliki akses yang diperlukan", code: "insufficient_scope" });
      return;
    case "rate_limited":
      if (result.retryAfter !== null) res.setHeader("Retry-After", result.retryAfter);
      res.status(429).json({ error: "Batas permintaan Ruang Simpan tercapai", code: "rate_limited" });
      return;
    case "source_unavailable":
      res.status(503).json({ error: "Layanan Ruang Simpan tidak tersedia", code: "source_unavailable" });
      return;
    case "ok":
      res.status(200).json(GetRuangSimpanCompanyProfileResponse.parse({ userId, profile: result.profile }));
  }
});

export default router;