import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { urlToHttpOptions } from "node:url";

function isLoopback(host) {
  return typeof host === "string" && (
    (net.isIP(host) === 4 && host.startsWith("127."))
    || host === "::1" || host === "[::1]"
  );
}

function attemptLog() {
  const attempts = [];
  return {
    reject(destination) {
      attempts.push(destination);
      throw new Error(`Unexpected outbound request: ${destination}`);
    },
    assertNoOutbound() {
      assert.equal(attempts.length, 0,
        `Fixture tidak boleh menghubungi layanan luar:\n${attempts.join("\n")}`);
    },
  };
}

export function guardOutboundFetch(target = globalThis, log = attemptLog()) {
  const originalFetch = target.fetch;
  target.fetch = async (input, init) => {
    const url = new URL(input instanceof URL ? input.href
      : typeof input === "string" ? input : input.url);
    if (!isLoopback(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
      log.reject(url.origin);
    }
    // Native fetch follows redirects without re-entering this wrapper.
    return originalFetch.call(target, input, { ...init, redirect: "error" });
  };
  return {
    assertNoOutbound: log.assertNoOutbound,
    restore() { target.fetch = originalFetch; },
  };
}

// Test-only instrumentation. No application module imports this helper.
export function guardOutboundNetwork() {
  const log = attemptLog();
  const fetchGuard = guardOutboundFetch(globalThis, log);
  const originals = [];
  const replace = (target, key, wrapper) => {
    const original = target[key];
    originals.push(() => { target[key] = original; });
    target[key] = wrapper(original);
  };
  for (const transport of [http, https]) {
    for (const method of ["request", "get"]) {
      replace(transport, method, (original) => function (...args) {
        const input = args[0];
        const isUrl = typeof input === "string" || input instanceof URL;
        const options = isUrl
          ? { ...urlToHttpOptions(new URL(input)),
            ...(typeof args[1] === "object" && args[1] !== null ? args[1] : {}) }
          : input ?? {};
        const host = options.hostname || options.host || "localhost";
        if (options.socketPath || !isLoopback(host)) {
          log.reject(`${transport === https ? "https" : "http"}://${host}`);
        }
        return original.apply(this, args);
      });
    }
  }
  // Covers cached request aliases, custom agents, TLS and clients (e.g. undici)
  // that connect directly instead of calling http.request. Check before DNS
  // or a connection attempt in the original implementation.
  replace(net.Socket.prototype, "connect", (original) => function (...args) {
    // net.connect passes its normalized arguments as a single array.
    const values = Array.isArray(args[0]) ? args[0] : args;
    const options = typeof values[0] === "object" && values[0] !== null
      ? values[0]
      : typeof values[0] === "number"
        ? { port: values[0], host: typeof values[1] === "string" ? values[1] : "localhost" }
        : { path: values[0] };
    const host = options.host || options.hostname || "localhost";
    if (options.path || !isLoopback(host)) log.reject(`socket://${host}`);
    return original.apply(this, args);
  });
  // Keep ESM named imports aligned with default/CJS built-in exports.
  syncBuiltinESMExports();
  return {
    assertNoOutbound: log.assertNoOutbound,
    restore() {
      for (const restore of originals.reverse()) restore();
      fetchGuard.restore();
      syncBuiltinESMExports();
    },
  };
}
