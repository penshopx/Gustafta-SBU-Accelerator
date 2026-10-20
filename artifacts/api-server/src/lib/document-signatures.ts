import { access, mkdir, open, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { limitedProcess, SCAN_DATABASE } from "./document-malware";
import { logger } from "./logger";
import { createSignatureMonitor, type SignatureHealth } from "./document-signature-monitor";

// Freshclam can leave the file mtime unchanged or touch an old database.
// Read the signed CVD/CLD header's build epoch, not the filesystem timestamp.
// main is deliberately not age-checked: official main databases change rarely.
export async function readSignatureHealth(database = SCAN_DATABASE): Promise<SignatureHealth> {
  try {
    try { await access(join(database, "main.cvd")); }
    catch { await access(join(database, "main.cld")); }
    let file;
    try { file = await open(join(database, "daily.cvd"), "r"); }
    catch { file = await open(join(database, "daily.cld"), "r"); }
    try {
      const header = Buffer.alloc(512);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      const fields = header.toString("ascii", 0, bytesRead).trim().split(":");
      const epoch = fields[8]?.trim();
      const builtAt = epoch && /^\d+$/.test(epoch) ? Number(epoch) * 1000 : NaN;
      if (bytesRead !== 512 || fields[0] !== "ClamAV-VDB" ||
          !Number.isSafeInteger(builtAt) || builtAt <= 0 || builtAt > Date.now()) {
        return { state: "unreadable" };
      }
      return { state: "available", builtAt };
    } finally { await file.close(); }
  } catch (error) {
    return { state: (error as NodeJS.ErrnoException)?.code === "ENOENT" ? "missing" : "unreadable" };
  }
}

async function updateSignatures() {
  await mkdir(SCAN_DATABASE, { recursive: true, mode: 0o700 });
  const config = join(SCAN_DATABASE, "freshclam.conf");
  await writeFile(config, `DatabaseDirectory ${SCAN_DATABASE}\nDatabaseMirror database.clamav.net\nDatabaseOwner ${userInfo().username}\nConnectTimeout 15\nReceiveTimeout 60\nTestDatabases no\n`, { mode: 0o600 });
  return await limitedProcess("freshclam", [`--config-file=${config}`, "--stdout"], 180_000, 60) === 0;
}

// Freshclam downloads signed signatures only, never uploads documents.
// Dependencies are injectable only for offline operational regression tests.
export function startSignatureUpdates({
  run = updateSignatures,
  health = readSignatureHealth,
  notify = createSignatureMonitor((notice) => {
    const level = notice.severity === "critical" ? "error" : notice.severity === "warning" ? "warn" : "info";
    logger[level](notice, notice.event === "scan_signature_recovered"
      ? "Local signature update recovered" : "Operator action required: local antivirus signatures");
  }),
  schedule = (callback: () => void) => {
    const timer = setInterval(callback, 12 * 60 * 60_000);
    timer.unref();
    return () => clearInterval(timer);
  },
}: {
  run?: () => Promise<boolean>;
  health?: () => Promise<SignatureHealth>;
  notify?: (success: boolean, health: SignatureHealth) => void;
  schedule?: (callback: () => void) => () => void;
} = {}) {
  let running = false;
  let stopped = false;
  const update = async () => {
    if (running || stopped) return;
    running = true;
    let success = false;
    try {
      success = await run();
    } catch {
      // Never log updater output, exception details, environment or credentials.
    }
    try {
      let status: SignatureHealth;
      try { status = await health(); }
      catch { status = { state: "unreadable" }; }
      if (!stopped) notify(success, status);
    } finally { running = false; }
  };
  void update();
  const cancel = schedule(() => void update());
  return () => { stopped = true; cancel(); };
}
