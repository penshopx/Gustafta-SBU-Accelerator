import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Deliberately independent of authentication, configuration, and upstream
// adapters. Old flags or credentials must never reactivate this integration.
router.use("/ruang-simpan", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.status(410).json({
    error: "Integrasi Gustafta/Ruang Simpan dibatalkan. Gunakan profil perusahaan lokal di aplikasi SBU.",
    code: "integration_cancelled",
  });
});

export default router;
