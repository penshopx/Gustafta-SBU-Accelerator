import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { registerHooks } from "node:module";

// Loaded in a separate runner before the fixture installs its instrumentation.
const cachedRequest = http.request;
const cachedFetch = globalThis.fetch;
const realConnect = net.Socket.prototype.connect;
let sent = 0;
net.Socket.prototype.connect = function () {
  sent++;
  throw new Error("Probe reached underlying socket transport");
};
const snapshots = [
  [globalThis, "fetch"], [http, "request"], [http, "get"],
  [https, "request"], [https, "get"], [net.Socket.prototype, "connect"],
].map(([target, key]) => [target, key, target[key]]);

globalThis.__offlineTransportProbe = async () => {
  const mode = process.env.OFFLINE_TRANSPORT_PROBE;
  if (mode === "clean") {
    console.log("OFFLINE_PROBE_CLEAN");
    return;
  }
  let caught = false;
  try {
    if (mode === "fetch") await fetch("https://example.invalid/session");
    else if (mode === "cached-fetch") await cachedFetch("https://example.invalid/session");
    else if (mode === "socket") net.connect({ host: "example.invalid", port: 80 });
    else if (mode === "tls") tls.connect({ host: "example.invalid", port: 443 });
    else {
      const request = mode === "cached" ? cachedRequest
        : mode.startsWith("https") ? https[mode.split("-")[1]] : http[mode.split("-")[1]];
      // Model the SDK swallowing both synchronous throws and emitted errors.
      await new Promise((resolve, reject) => {
        const req = request("https://example.invalid/session".replace(
          "https:", mode.startsWith("https") ? "https:" : "http:",
        ), resolve);
        req.on("error", reject);
        if (!mode.endsWith("-get")) req.end();
      });
    }
  } catch (error) {
    assert.match((error.cause ?? error).message, /Unexpected outbound request/);
    caught = true;
  }
  assert.equal(caught, true, "SDK menangkap penolakan jaringan");
  assert.equal(sent, 0, "tidak ada koneksi diteruskan ke transport asli");
  console.log("OFFLINE_PROBE_SWALLOWED");
};

// A failing root after hook can skip subsequent hooks. Exit observes the real
// suite cleanup, rather than depending on another after hook being called.
process.on("exit", () => {
  for (const [target, key, original] of snapshots) assert.equal(target[key], original, key);
  assert.equal(sent, 0);
  net.Socket.prototype.connect = realConnect;
  console.log("OFFLINE_TRANSPORTS_RESTORED");
});

const fixtureUrl = new URL("../sbu-assessment-clerk.test.mjs", import.meta.url).href;
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== fixtureUrl) return loaded;
    const source = String(loaded.source);
    const marker = "// Register tests only after async setup finishes";
    assert.equal(source.split(marker).length, 2);
    return { ...loaded, source: source.replace(marker,
      'test("SDK swallowed outbound probe", globalThis.__offlineTransportProbe);\n' + marker) };
  },
});
