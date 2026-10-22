import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

// Use Firefox's native WebDriver Print Page command, not Playwright page.pdf()
// (which only supports Chromium). Nothing except WebDriver loopback is served.
export async function firefoxPdf(input, output, settings) {
  const driver = spawn(process.env.GECKODRIVER_BIN || "geckodriver",
    ["--host", "127.0.0.1", "--port", "0", "--log", "info", "--profile-root", dirname(output)], {
      stdio: ["ignore", "pipe", "pipe"], detached: true,
    });
  let session;
  let origin;
  let log = "";
  let failure;
  const command = async (path, body, method = "POST") => {
    const response = await fetch(`${origin}${path}`, {
      method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json();
    assert.ok(response.ok && !result.value?.error,
      `Firefox WebDriver ${path}: ${JSON.stringify(result.value)}`);
    return result.value;
  };
  try {
    origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`geckodriver startup timed out: ${log}`)), 15_000);
      const onData = (chunk) => {
        log = (log + chunk.toString()).slice(-16_384);
        const match = log.match(/Listening on (127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://${match[1]}`); }
      };
      driver.stdout.on("data", onData);
      driver.stderr.on("data", onData);
      driver.once("error", (error) => { clearTimeout(timer); reject(error); });
      driver.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`geckodriver exited (${code}): ${log}`));
      });
    });
    const value = await command("/session", {
      capabilities: { alwaysMatch: {
        browserName: "firefox",
        "moz:firefoxOptions": {
          ...(process.env.FIREFOX_BIN ? { binary: process.env.FIREFOX_BIN } : {}),
          args: ["-headless"],
          prefs: {
            // Local file only; refuse browser HTTP(S) traffic, even if the
            // generated CSP accidentally regresses. Driver uses Node loopback.
            "network.proxy.type": 1,
            "network.proxy.http": "127.0.0.1", "network.proxy.http_port": 9,
            "network.proxy.ssl": "127.0.0.1", "network.proxy.ssl_port": 9,
            "network.proxy.no_proxies_on": "",
            "network.trr.mode": 5,
            "network.dns.disablePrefetch": true,
            "network.prefetch-next": false,
          },
        },
      } },
    });
    session = value.sessionId;
    assert.equal(value.capabilities.browserName, "firefox");
    assert.equal(value.capabilities["moz:headless"], true);
    await command(`/session/${session}/timeouts`, { pageLoad: 45_000 });
    await command(`/session/${session}/url`, { url: pathToFileURL(input).href });
    const pdf = await command(`/session/${session}/print`, {
      orientation: "portrait", background: true, shrinkToFit: false,
      page: { width: 21, height: 29.7 },
      margin: { top: 1.8, bottom: 2.8, left: 1.6, right: 1.6 },
      ...(settings ? {
        page: { width: settings.widthCm, height: settings.heightCm },
        scale: settings.scale,
      } : {}),
    });
    assert.equal(typeof pdf, "string", "Firefox Print Page must return a base64 PDF");
    const bytes = Buffer.from(pdf, "base64");
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-", "Firefox returned no PDF");
    await writeFile(output, bytes);
    return `Firefox ${value.capabilities.browserVersion} / geckodriver ${value.capabilities["moz:geckodriverVersion"]}`;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      if (session) await command(`/session/${session}`, undefined, "DELETE");
    } catch (cleanupError) {
      if (!failure) throw cleanupError;
      throw new AggregateError([failure, cleanupError], "Firefox print and session cleanup failed");
    } finally {
      // Also terminate any descendants when session creation/printing fails.
      // All profiles and process groups belong to this single synthetic render.
      if (driver.pid) {
        try { process.kill(-driver.pid, "SIGTERM"); } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
        if (driver.exitCode === null && driver.signalCode === null) {
          const exited = once(driver, "exit");
          const timer = setTimeout(() => {
            try { process.kill(-driver.pid, "SIGKILL"); } catch (error) {
              if (error.code !== "ESRCH") driver.emit("error", error);
            }
          }, 5_000);
          try { await exited; } finally { clearTimeout(timer); }
        }
      }
    }
  }
}
