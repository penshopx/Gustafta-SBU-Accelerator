import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { request as namedHttpRequest } from "node:http";
import { request as namedHttpsRequest } from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { test } from "node:test";
import { guardOutboundNetwork } from "./helpers/offline-network.mjs";

test("semua bentuk HTTP/HTTPS ditolak sebelum delegasi dan transport dipulihkan", async () => {
  const calls = [];
  const restorers = [];
  // Canaries prevent actual network traffic even if the guard regresses.
  for (const [target, key] of [
    [globalThis, "fetch"], [http, "request"], [http, "get"],
    [https, "request"], [https, "get"], [net.Socket.prototype, "connect"],
  ]) {
    const original = target[key];
    restorers.push(() => { target[key] = original; });
    target[key] = function (...args) { calls.push({ target, key, args, receiver: this }); return "local"; };
  }
  const snapshots = [
    globalThis.fetch, http.request, http.get, https.request, https.get, net.Socket.prototype.connect,
  ];
  const guard = guardOutboundNetwork();
  try {
    assert.equal(namedHttpRequest, http.request);
    assert.equal(namedHttpsRequest, https.request);
    for (const transport of [http, https]) {
      const protocol = transport === http ? "http:" : "https:";
      for (const method of ["request", "get"]) {
        for (const args of [
          [`${protocol}//example.invalid/path`],
          [new URL(`${protocol}//example.invalid/path`)],
          [{ hostname: "example.invalid", port: 443 }],
          [{ host: "example.invalid", headers: { host: "127.0.0.1" } }],
          [`${protocol}//127.0.0.1`, { hostname: "example.invalid" }],
          [`${protocol}//127.0.0.1`, { socketPath: "/tmp/not-an-http-fixture.sock" }],
          [{ hostname: "localhost" }],
          [{ hostname: "127.0.0.1.example.invalid" }],
          [{ hostname: "127.999.0.1" }],
        ]) {
          const before = calls.length;
          assert.throws(() => transport[method](...args), /Unexpected outbound request/);
          assert.equal(calls.length, before, "permintaan ditolak sebelum transport asli");
        }
        const callback = () => {};
        const args = [{ hostname: "127.0.0.1", headers: { host: "sbu.example.test" } }, callback];
        assert.equal(transport[method](...args), "local");
        assert.deepEqual(calls.at(-1).args, args);
        assert.equal(calls.at(-1).receiver, transport);
        assert.equal(transport[method](new URL(`${protocol}//[::1]:1234/`)), "local");
      }
    }
    const socket = new net.Socket();
    for (const args of [
      [{ host: "example.invalid", port: 80 }], [80, "example.invalid"],
      [[{ host: "example.invalid", port: 80 }, null]], ["/tmp/no-network.sock"],
    ]) {
      const before = calls.length;
      assert.throws(() => socket.connect(...args), /Unexpected outbound request/);
      assert.equal(calls.length, before);
    }
    assert.equal(socket.connect({ host: "127.0.0.2", port: 80 }), "local");
    assert.equal(socket.connect(80, "::1"), "local");
    const before = calls.length;
    await assert.rejects(fetch("https://example.invalid"), /Unexpected outbound request/);
    assert.equal(calls.length, before);
    // The attempt log persists even after consumers catch every exception.
    assert.throws(() => guard.assertNoOutbound(), /Fixture tidak boleh menghubungi layanan luar/);
  } finally {
    guard.restore();
    assert.deepEqual([
      globalThis.fetch, http.request, http.get, https.request, https.get, net.Socket.prototype.connect,
    ], snapshots);
    assert.equal(namedHttpRequest, http.request);
    assert.equal(namedHttpsRequest, https.request);
    for (const restore of restorers.reverse()) restore();
    syncBuiltinESMExports();
  }
});

for (const mode of ["clean", "fetch", "cached-fetch", "http-request", "http-get", "https-request", "https-get", "socket", "tls", "cached"]) {
  test(mode === "clean" ? "transport suite dipulihkan setelah pengujian berhasil"
    : `SDK menangkap ${mode}, tetapi suite tetap gagal dan seluruh transport dipulihkan`, () => {
    const env = { ...process.env, OFFLINE_TRANSPORT_PROBE: mode };
    for (const key of Object.keys(env)) {
      if (/CLERK/i.test(key) || key === "NODE_TEST_CONTEXT" || key === "NODE_OPTIONS") delete env[key];
    }
    const result = spawnSync(process.execPath, [
      "--import", fileURLToPath(new URL("./helpers/sbu-clerk-outbound-probe.mjs", import.meta.url)),
      "--test", "--test-reporter=tap", "--test-name-pattern=^SDK swallowed outbound probe$",
      fileURLToPath(new URL("./sbu-assessment-clerk.test.mjs", import.meta.url)),
    ], { env, encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
    const output = stripVTControlCharacters(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    assert.ifError(result.error);
    assert.equal(result.signal, null, output);
    assert.match(output, /OFFLINE_TRANSPORTS_RESTORED/);
    if (mode === "clean") {
      assert.equal(result.status, 0, output);
      assert.match(output, /OFFLINE_PROBE_CLEAN/);
      assert.match(output, /ok \d+ - SDK swallowed outbound probe/);
      assert.match(output, /^# pass 1$/m);
      assert.match(output, /^# fail 0$/m);
      return;
    }
    assert.equal(result.status, 1, output);
    assert.match(output, /OFFLINE_PROBE_SWALLOWED/);
    assert.match(output, /not ok \d+ - SDK swallowed outbound probe/);
    assert.match(output, /failureType: 'hookFailed'/);
    assert.match(output, /Fixture tidak boleh menghubungi layanan luar/);
    assert.doesNotMatch(output, /Probe reached underlying socket transport/);
  });
}
