import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { createProxyMiddleware } from "http-proxy-middleware";

// Capture the production options, then use the real proxy implementation with
// an exclusively loopback target. No Clerk SDK, credentials or DNS are needed.
const directory = fileURLToPath(new URL(".", import.meta.url));
const temporary = await mkdtemp(join(directory, ".clerk-response-"));
let options;
try {
  await build({
    entryPoints: [join(directory, "../src/middlewares/clerkProxyMiddleware.ts")],
    outfile: join(temporary, "proxy.mjs"),
    bundle: true, platform: "node", format: "esm",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.CLERK_SECRET_KEY": JSON.stringify("sk_live_synthetic_local_fixture"),
    },
    plugins: [{
      name: "capture-local-proxy-options",
      setup(builder) {
        builder.onResolve({ filter: /^http-proxy-middleware$/ }, () => ({
          path: "proxy", namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `export const createProxyMiddleware = options => {
            globalThis.__localClerkResponseOptions = options;
            return () => { throw new Error("Only the loopback proxy may run"); };
          };`,
        }));
      },
    }],
  });
  const { clerkProxyMiddleware } = await import(join(temporary, "proxy.mjs"));
  try {
    // Build-time constants avoid reading or changing workspace credentials.
    clerkProxyMiddleware();
    options = globalThis.__localClerkResponseOptions;
  } finally {
    delete globalThis.__localClerkResponseOptions;
  }
} catch (error) {
  await rm(temporary, { recursive: true, force: true });
  throw error;
}
after(() => rm(temporary, { recursive: true, force: true }));

async function listen(t, handler) {
  const server = createServer(handler);
  // Forced socket cleanup also handles the deliberately broken streams.
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, upstreamHandler, observe = () => {}, overrides = {}) {
  const upstream = await listen(t, upstreamHandler);
  const proxy = createProxyMiddleware({
    ...options,
    ...overrides,
    target: upstream,
    on: {
      ...options.on,
      proxyRes(upstreamResponse, req, res) {
        options.on.proxyRes(upstreamResponse, req, res);
        observe(upstreamResponse, res);
      },
    },
  });
  return listen(t, (req, res) => proxy(req, res, error => {
    res.writeHead(error ? 500 : 404, { "content-length": "0" });
    res.end();
  }));
}

function receive(url, { method = "GET", onData = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let response;
    const chunks = [];
    const req = request(url, { method, agent: false }, res => {
      response = res;
      res.on("data", chunk => { chunks.push(chunk); onData(res); });
      res.on("error", error => {
        if (error.code !== "ECONNRESET") reject(error);
      });
      res.on("close", () => {
        clearTimeout(deadline);
        resolve({
          status: res.statusCode, headers: res.headers,
          body: Buffer.concat(chunks), complete: res.complete, aborted: res.aborted,
        });
      });
    });
    // An absolute deadline, not an inactivity timeout: trickled or hung streams
    // must fail the test rather than silently passing after client cancellation.
    const deadline = setTimeout(() => {
      response?.destroy();
      req.destroy();
      reject(new Error("Proxy response did not finish or abort within 2 seconds"));
    }, 2_000);
    req.on("error", error => { clearTimeout(deadline); reject(error); });
    req.end();
  });
}

function assertFinished(result, status, body) {
  assert.equal(result.status, status);
  assert.equal(result.complete, true);
  assert.equal(result.aborted, false);
  assert.deepEqual(result.body, Buffer.from(body));
  assert.equal(result.headers["transfer-encoding"], undefined);
}

test("unknown-length chunks are buffered into an exact Content-Length", { timeout: 5_000 }, async t => {
  const body = Buffer.from("respons masuk: selamat datang ✓");
  let upstreamWasChunked = false;
  const url = await fixture(t, (_req, res) => {
    res.writeHead(201, { "content-type": "text/plain", "x-fixture": "buffered" });
    res.write(body.subarray(0, 9));
    setImmediate(() => res.end(body.subarray(9)));
  }, upstream => {
    upstreamWasChunked = upstream.headers["transfer-encoding"] === "chunked";
    assert.equal(upstream.headers["content-length"], undefined);
  });
  const result = await receive(url);
  assert.equal(upstreamWasChunked, true);
  assertFinished(result, 201, body);
  assert.equal(result.headers["content-length"], String(body.length));
  assert.equal(result.headers["x-fixture"], "buffered");
});

test("empty unknown-length response finishes with Content-Length zero", { timeout: 5_000 }, async t => {
  const url = await fixture(t, (_req, res) => {
    res.writeHead(200, { "transfer-encoding": "chunked" });
    res.end();
  });
  const result = await receive(url);
  assertFinished(result, 200, "");
  assert.equal(result.headers["content-length"], "0");
});

for (const knownLength of [false, true]) {
test(`${knownLength ? "streaming" : "buffering"} preserves compressed bytes and Content-Encoding`, { timeout: 5_000 }, async t => {
  const encoded = gzipSync("synthetic compressed response ".repeat(20));
  const url = await fixture(t, (_req, res) => {
    const headers = { "content-encoding": "gzip", "content-type": "application/json" };
    if (knownLength) headers["content-length"] = String(encoded.length);
    res.writeHead(200, headers);
    res.write(encoded.subarray(0, 7));
    res.end(encoded.subarray(7));
  });
  const result = await receive(url);
  assertFinished(result, 200, encoded);
  assert.equal(result.headers["content-encoding"], "gzip");
  assert.equal(result.headers["content-length"], String(encoded.length));
});
}

test("known-length responses stream without waiting for upstream end", { timeout: 5_000 }, async t => {
  let upstreamResponse;
  const url = await fixture(t, (_req, res) => {
    upstreamResponse = res;
    res.writeHead(200, { "content-length": "6" });
    res.write("abc");
    // Only the downstream client can release the final chunk.
  });
  const result = await receive(url, { onData: () => upstreamResponse.end("def") });
  assertFinished(result, 200, "abcdef");
  assert.equal(result.headers["content-length"], "6");
});

for (const [method, status, length] of [
  ["HEAD", 200, "123"], ["GET", 204, undefined], ["GET", 304, "123"],
  ["HEAD", 200, undefined], ["GET", 304, undefined],
]) {
  test(`${method} ${status} with length ${length ?? "absent"} finishes without a body`, { timeout: 5_000 }, async t => {
    const url = await fixture(t, (_req, res) => {
      // Even an erroneous upstream length on 204 must not escape the proxy.
      const headers = { "x-fixture": "bodyless" };
      if (length !== undefined || status === 204) headers["content-length"] = length ?? "123";
      res.writeHead(status, headers);
      res.end();
    });
    const result = await receive(url, { method });
    assertFinished(result, status, "");
    assert.equal(result.headers["content-length"], length);
    assert.equal(result.headers["x-fixture"], "bodyless");
  });
}

test("hop-by-hop and Connection-nominated headers do not escape the proxy", { timeout: 5_000 }, async t => {
  const url = await fixture(t, (_req, res) => {
    res.writeHead(200, {
      connection: "keep-alive, X-Upstream-Only",
      "keep-alive": "timeout=37",
      "proxy-connection": "keep-alive",
      "x-upstream-only": "private transport metadata",
      "proxy-authenticate": "Basic realm=fixture",
      "proxy-authorization": "synthetic",
      te: "trailers", trailer: "X-Trailer", upgrade: "fixture",
      "x-end-to-end": "preserved",
      "set-cookie": ["first=1; HttpOnly", "second=2; Secure"],
    });
    res.write("local");
    res.end();
  });
  const result = await receive(url);
  assertFinished(result, 200, "local");
  for (const name of ["keep-alive", "proxy-connection", "x-upstream-only", "proxy-authenticate",
    "proxy-authorization", "te", "trailer", "upgrade"]) {
    assert.equal(result.headers[name], undefined, name);
  }
  // Node may generate its own Connection header; the upstream tokens must go.
  assert.doesNotMatch(result.headers.connection ?? "", /keep-alive|x-upstream-only/i);
  assert.equal(result.headers["x-end-to-end"], "preserved");
  assert.deepEqual(result.headers["set-cookie"], ["first=1; HttpOnly", "second=2; Secure"]);
});

test("upstream failure while buffering returns a complete empty non-chunked 502", { timeout: 5_000 }, async t => {
  let upstreamResponse;
  let errorObserved = false;
  const url = await fixture(t, (_req, res) => {
    upstreamResponse = res;
    res.writeHead(200, { "x-partial": "must-not-leak", "content-encoding": "gzip" });
    res.write("incomplete");
  }, (upstream, downstream) => {
    upstream.once("data", () => {
      assert.equal(downstream.headersSent, false);
      upstreamResponse.destroy();
    });
    upstream.once("error", () => { errorObserved = true; });
  });
  const result = await receive(url);
  assertFinished(result, 502, "");
  assert.equal(errorObserved, true);
  assert.equal(result.headers["content-length"], "0");
  assert.equal(result.headers["x-partial"], undefined);
  assert.equal(result.headers["content-encoding"], undefined);
});

test("upstream failure after streaming headers aborts the downstream connection", { timeout: 5_000 }, async t => {
  let upstreamResponse;
  let errorObserved = false;
  const url = await fixture(t, (_req, res) => {
    upstreamResponse = res;
    res.writeHead(200, { "content-length": "100" });
    res.write("partial");
  }, upstream => {
    upstream.once("error", () => { errorObserved = true; });
  });
  // Destroy only after the client has received real headers and body bytes.
  const result = await receive(url, { onData: () => upstreamResponse.destroy() });
  assert.equal(errorObserved, true);
  assert.equal(result.status, 200);
  assert.equal(result.complete, false);
  assert.equal(result.aborted, true);
  assert.equal(result.body.toString(), "partial");
  assert.equal(result.headers["content-length"], "100");
  assert.equal(result.headers["transfer-encoding"], undefined);
});

test("production proxy has a finite upstream inactivity timeout", () => {
  assert.equal(options.proxyTimeout, 15_000);
});

for (const stage of ["no headers", "buffered headers", "buffered body", "streamed headers", "streamed body"]) {
  test(`upstream left open at ${stage} is timed out without client cancellation`, { timeout: 5_000 }, async t => {
    let closed;
    const upstreamClosed = new Promise(resolve => { closed = resolve; });
    let upstreamResponse;
    const streaming = stage.startsWith("streamed");
    const hasBody = stage.endsWith("body");
    let receivedHeaders = false;
    const url = await fixture(t, (_req, res) => {
      upstreamResponse = res;
      res.once("close", closed);
      // Deliberately never end or destroy this response: the proxy must do so.
      if (stage === "no headers") return;
      const headers = { "x-partial": "must-not-leak", "content-type": "text/plain" };
      if (streaming) headers["content-length"] = "100";
      res.writeHead(200, headers);
      res.flushHeaders();
      if (hasBody) res.write("partial");
    }, (_upstream, downstream) => {
      receivedHeaders = true;
      assert.equal(downstream.headersSent, streaming);
    }, { proxyTimeout: 100 });

    // receive() has an independent absolute deadline which rejects, rather
    // than returning a result, if client-side cancellation is ever required.
    let result;
    if (stage === "streamed headers") {
      // writeHead marks headers sent, but Node may not flush them to the wire
      // until the first body byte. The client must still see a reset, not 502.
      await assert.rejects(receive(url), { code: "ECONNRESET" });
    } else {
      result = await receive(url);
    }
    assert.equal(receivedHeaders, stage !== "no headers");
    if (streaming && result) {
      assert.equal(result.status, 200);
      assert.equal(result.complete, false);
      assert.equal(result.aborted, true);
      assert.equal(result.body.toString(), hasBody ? "partial" : "");
      assert.equal(result.headers["content-length"], "100");
      assert.equal(result.headers["transfer-encoding"], undefined);
    } else if (!streaming) {
      assertFinished(result, 502, "");
      assert.equal(result.headers["content-length"], "0");
      assert.equal(result.headers["x-partial"], undefined);
      assert.equal(result.headers["content-type"], undefined);
    }
    await upstreamClosed;
    assert.equal(upstreamResponse.destroyed, true);
  });
}
