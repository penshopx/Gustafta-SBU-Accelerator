import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { parsePublishableKey, publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkRequestOriginMiddleware } from "./middlewares/clerkRequestOrigin";
import healthRouter from "./routes/health";
import retiredIntegrationsRouter from "./routes/retired-integrations";
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
          url: req.url?.split("?")[0]?.replace(/\/sessions\/[^/]+/g, "/sessions/[redacted]"),
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
// Health probes do not select a Clerk domain or access private data.
app.use("/api", healthRouter);
// Reject retired endpoints before Clerk, parsing, or any private-data access.
app.use("/api", retiredIntegrationsRouter);
app.use(clerkRequestOriginMiddleware());
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
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
  const isIdentityCheck = req.method === "GET" && req.path === "/api/me";
  if (isIdentityCheck) {
    res.setHeader("Cache-Control", "private, no-store");
    if (!auth.userId) {
      const reason = res.getHeader("X-Clerk-Auth-Reason");
      const code = reason === "session-token-and-uat-missing" || reason === "session-token-missing"
        ? "session_missing"
        : reason === "session-token-expired" || reason === "token-expired"
          ? "session_expired"
          : "session_not_verified";
      req.log.warn({ event: "session_verification_denied", code }, "Identity check denied");
      res.status(401).json({ error: "Silakan masuk untuk melanjutkan.", code });
      return;
    }
  }
  if (auth.userId) {
    const frontendApi = parsePublishableKey(clerkPublishableKey(req))?.frontendApi;
    if (!frontendApi || auth.sessionClaims?.iss !== `https://${frontendApi}`) {
      if (isIdentityCheck) {
        req.log.warn({ event: "session_verification_denied", code: "session_issuer_mismatch" }, "Identity check denied");
        res.status(401).json({ error: "Silakan masuk untuk melanjutkan.", code: "session_issuer_mismatch" });
      } else {
        res.status(401).json({ error: "Silakan masuk untuk melanjutkan." });
      }
      return;
    }
  }
  next();
});

app.use("/api", router);

export default app;
