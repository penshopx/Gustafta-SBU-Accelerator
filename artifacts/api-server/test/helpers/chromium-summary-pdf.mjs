import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Chromium CLI printing has no scale/preferCSSPageSize options. Use its native
// DevTools printToPDF over inherited pipes, never a public debugging port.
export async function chromiumPdf(input, output, settings) {
  const browser = spawn(process.env.CHROMIUM_BIN || "chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-component-update", "--no-first-run",
    "--no-default-browser-check", "--host-resolver-rules=MAP * ~NOTFOUND",
    `--user-data-dir=${join(dirname(output), `browser-${output.split("/").at(-1)}`)}`,
    "--remote-debugging-pipe", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  const pending = new Map();
  let serial = 0;
  let buffer = "";
  let log = "";
  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  browser.stderr.on("data", chunk => { log = (log + chunk).slice(-8192); });
  browser.once("error", rejectPending);
  browser.once("exit", code => rejectPending(new Error(`Chromium exited (${code}): ${log}`)));
  browser.stdio[3].on("error", rejectPending);
  browser.stdio[4].on("data", chunk => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf("\0")) !== -1) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  });
  const command = async (method, params = {}, sessionId) => {
    const id = ++serial;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chromium ${method} timed out: ${log}`));
        }, 60_000);
        browser.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
      });
    } finally { clearTimeout(timer); }
  };
  try {
    const version = await command("Browser.getVersion");
    const { targetId } = await command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    const navigation = await command("Page.navigate", { url: pathToFileURL(input).href }, sessionId);
    assert.ok(!navigation.errorText, navigation.errorText);
    // Evaluate after local navigation commits; no external resources or scripts.
    const ready = await command("Runtime.evaluate", {
      expression: `new Promise(resolve => {
        if (document.readyState === "complete") resolve(true);
        else window.addEventListener("load", () => resolve(true), {once:true});
      })`, awaitPromise: true, returnByValue: true,
    }, sessionId);
    assert.equal(ready.result.value, true);
    const { data } = await command("Page.printToPDF", {
      landscape: false, displayHeaderFooter: false, printBackground: true,
      paperWidth: settings.widthCm / 2.54, paperHeight: settings.heightCm / 2.54,
      scale: settings.scale, preferCSSPageSize: settings.preferCSSPageSize,
      marginTop: 1.8 / 2.54, marginBottom: 2.8 / 2.54,
      marginLeft: 1.6 / 2.54, marginRight: 1.6 / 2.54,
    }, sessionId);
    const bytes = Buffer.from(data, "base64");
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    await writeFile(output, bytes);
    return version.product;
  } finally {
    if (browser.exitCode === null && browser.signalCode === null) {
      const exited = once(browser, "exit");
      browser.kill("SIGTERM");
      const timer = setTimeout(() => browser.kill("SIGKILL"), 5000);
      try { await exited; } finally { clearTimeout(timer); }
    }
  }
}
