import { mkdir, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { limitedProcess, SCAN_DATABASE } from "./document-malware";
import { logger } from "./logger";

// Freshclam downloads signed signatures only, never uploads documents.
export function startSignatureUpdates() {
  let running = false;
  let stopped = false;
  const update = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await mkdir(SCAN_DATABASE, { recursive: true, mode: 0o700 });
      const config = join(SCAN_DATABASE, "freshclam.conf");
      await writeFile(config, `DatabaseDirectory ${SCAN_DATABASE}\nDatabaseMirror database.clamav.net\nDatabaseOwner ${userInfo().username}\nConnectTimeout 15\nReceiveTimeout 60\nTestDatabases no\n`, { mode: 0o600 });
      const code = await limitedProcess("freshclam", [`--config-file=${config}`, "--stdout"], 180_000, 60);
      logger[code === 0 ? "info" : "warn"]({ event: "scan_signature_update", success: code === 0 },
        code === 0 ? "Local malware signatures updated" : "Signature update failed; missing or stale signatures block downloads");
    } catch {
      logger.warn({ event: "scan_signature_update_failed" }, "Local signature update unavailable");
    } finally { running = false; }
  };
  void update();
  const timer = setInterval(() => void update(), 12 * 60 * 60_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
