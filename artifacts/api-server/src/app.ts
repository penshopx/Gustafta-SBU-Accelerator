import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { parsePublishableKey, publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
const clerkPublishableKey = (req: Request) => publishableKeyFromHost(
  getClerkProxyHost(req) ?? "",
  process.env.CLERK_PUBLISHABLE_KEY,
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use("/api/ruang-simpan/company-profile", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: clerkPublishableKey(req),
  })),
);
// Clerk verifies the signature and lifetime, but a locally supplied JWT key can
// also verify a token whose issuer belongs to a different Clerk instance.
app.use((req, res, next) => {
  const auth = getAuth(req);
  if (auth.userId) {
    const frontendApi = parsePublishableKey(clerkPublishableKey(req))?.frontendApi;
    if (!frontendApi || auth.sessionClaims?.iss !== `https://${frontendApi}`) {
      if (req.path === "/api/ruang-simpan/company-profile") {
        res.status(401).json({ error: "Autentikasi diperlukan", code: "unauthenticated" });
      } else {
        res.status(401).json({ error: "Silakan masuk untuk melanjutkan." });
      }
      return;
    }
  }
  next();
});

app.use("/api", router);
app.use("/api/ruang-simpan/company-profile", (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  const isInvalidBody = error !== null && typeof error === "object" &&
    "type" in error && [
      "entity.parse.failed",
      "entity.too.large",
      "encoding.unsupported",
      "charset.unsupported",
      "request.aborted",
    ].includes(String(error.type));
  if (isInvalidBody) {
    res.status(400).json({ error: "Parameter kueri dan isi permintaan tidak diperbolehkan", code: "invalid_request" });
    return;
  }
  res.status(503).json({ error: "Layanan Ruang Simpan tidak tersedia", code: "source_unavailable" });
});

export default app;
