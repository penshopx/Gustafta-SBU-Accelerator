import app from "./app";
import { logger } from "./lib/logger";
import { startDocumentCleanup } from "./lib/document-cleanup-job";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const stopDocumentCleanup = startDocumentCleanup();
const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

process.once("SIGTERM", () => { stopDocumentCleanup(); server.close(); });
process.once("SIGINT", () => { stopDocumentCleanup(); server.close(); });
