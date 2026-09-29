import express, { type Express, type Request } from "express";
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
      res.status(401).json({ error: "Silakan masuk untuk melanjutkan." });
      return;
    }
  }
  next();
});

app.use("/api", router);

export default app;
