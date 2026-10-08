import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const directory = fileURLToPath(new URL(".", import.meta.url));
const temporary = await mkdtemp(join(directory, ".clerk-origin-"));
after(() => rm(temporary, { recursive: true, force: true }));
await build({
  entryPoints: [join(directory, "../src/middlewares/clerkProxyMiddleware.ts"),
    join(directory, "../src/middlewares/clerkRequestOrigin.ts")],
  outdir: temporary, bundle: true, platform: "node", format: "esm", outExtension: { ".js": ".mjs" },
  plugins: [{
    name: "capture-proxy-no-network",
    setup(builder) {
      builder.onResolve({ filter: /^http-proxy-middleware$/ }, () => ({ path: "proxy", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: `export const createProxyMiddleware = (options) => {
          globalThis.__clerkProxyOptions = options;
          return () => { throw new Error("No network permitted"); };
        };`,
      }));
    },
  }],
});
const { clerkRequestOriginMiddleware, normalizeClerkHost } = await import(join(temporary, "clerkRequestOrigin.mjs"));
const { clerkProxyMiddleware, getClerkProxyHost } = await import(join(temporary, "clerkProxyMiddleware.mjs"));

const env = {
  NODE_ENV: "production", REPLIT_DOMAINS: "primary.example.test",
  CLERK_ALLOWED_HOSTS: "alternate.example.test",
  CLERK_TRUSTED_PROXY_CIDRS: "192.0.2.10/32,2001:db8:1::/64",
};
function run(headers, peer = "198.51.100.1", config = env) {
  const req = { headers: { ...headers }, socket: { remoteAddress: peer } };
  const result = { req, continued: false };
  const res = {
    setHeader(key, value) { (result.headers ??= {})[key] = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; },
  };
  clerkRequestOriginMiddleware(config)(req, res, () => { result.continued = true; });
  return result;
}

test("operator/platform hosts are exact matches, never suffixes or wildcard domains", () => {
  for (const host of ["primary.example.test", "ALTERNATE.EXAMPLE.TEST:443",
    "gustafta-sbu-accelerator.replit.app"]) {
    assert.equal(run({ host }).continued, true, host);
  }
  for (const host of ["attacker.test", "primary.example.test.attacker.test", "localhost",
    "127.0.0.1", "alternate.example.test.", "https://primary.example.test",
    "primary.example.test/path", "primary.example.test@attacker.test",
    "primary.example.test:0", "primary.example.test:65536", "primary.example.test,attacker.test", undefined]) {
    const result = run({ host, "x-forwarded-host": "primary.example.test" });
    assert.equal(result.status, 421, String(host));
    assert.equal(result.continued, false);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
  }
  assert.equal(normalizeClerkHost(" ALTERNATE.EXAMPLE.TEST:443 "), "alternate.example.test");
});

test("untrusted forwarding headers cannot change the SDK or FAPI domain and protocol", () => {
  const result = run({
    host: "primary.example.test:443",
    "x-forwarded-host": "alternate.example.test",
    "x-forwarded-proto": "http,https",
    forwarded: "host=attacker.test;proto=http",
    "x-forwarded-for": "192.0.2.10",
    "x-forwarded-port": "80",
  });
  assert.equal(result.continued, true);
  assert.deepEqual(result.req.headers, {
    host: "primary.example.test", "x-forwarded-host": "primary.example.test", "x-forwarded-proto": "https",
  });
  assert.equal(getClerkProxyHost(result.req), "primary.example.test");
});

test("trusted socket peers support legitimate alternate domains including IPv6 and mapped IPv4", () => {
  for (const peer of ["192.0.2.10", "::ffff:192.0.2.10", "2001:db8:1::99"]) {
    const result = run({ host: "internal.invalid", "x-forwarded-host": "ALTERNATE.EXAMPLE.TEST:443" }, peer);
    assert.equal(result.continued, true, peer);
    assert.equal(result.req.headers.host, "alternate.example.test");
  }
  for (const peer of ["192.0.2.11", "2001:db8:2::99", "127.0.0.1", undefined]) {
    const result = run({ host: "primary.example.test", "x-forwarded-host": "alternate.example.test" }, peer);
    assert.equal(result.req.headers.host, "primary.example.test");
  }
});

test("trusted proxies must replace rather than append client-supplied forwarding values", () => {
  for (const forwarded of [
    "attacker.test", "primary.example.test, alternate.example.test",
    "alternate.example.test, primary.example.test",
    ["alternate.example.test"], ["primary.example.test", "alternate.example.test"],
    "https://alternate.example.test", "alternate.example.test:invalid", " ",
  ]) {
    const result = run({ host: "primary.example.test", "x-forwarded-host": forwarded }, "192.0.2.10");
    assert.equal(result.status, 421, JSON.stringify(forwarded));
    assert.equal(result.continued, false);
  }
  assert.equal(run({ host: "alternate.example.test", "x-forwarded-host": "" }, "192.0.2.10").continued, true);
});

test("default proxy policy trusts no peers and configuration errors fail explicitly", () => {
  const result = run({ host: "primary.example.test", "x-forwarded-host": "alternate.example.test" },
    "192.0.2.10", { ...env, CLERK_TRUSTED_PROXY_CIDRS: undefined });
  assert.equal(result.req.headers.host, "primary.example.test");
  for (const cidr of ["not-an-ip", "192.0.2.10/33", "2001:db8::/129", "192.0.2.10/x", "192.0.2.10/32/extra"]) {
    assert.throws(() => clerkRequestOriginMiddleware({ ...env, CLERK_TRUSTED_PROXY_CIDRS: cidr }));
  }
  assert.throws(() => clerkRequestOriginMiddleware({ ...env, CLERK_ALLOWED_HOSTS: "*.example.test" }));
  assert.equal(run({ host: "localhost:5000" }, "127.0.0.1", { NODE_ENV: "development" }).continued, true);
});

test("FAPI receives only the validated HTTPS origin, not a forged proxy URL", () => {
  // Synthetic credentials only; the proxy factory itself is intercepted.
  process.env.NODE_ENV = "production";
  process.env.CLERK_SECRET_KEY = "sk_live_synthetic_no_network";
  try {
    clerkProxyMiddleware();
    for (const [peer, expected] of [
      ["198.51.100.1", "primary.example.test"],
      ["192.0.2.10", "alternate.example.test"],
    ]) {
      const result = run({
        host: "primary.example.test", "x-forwarded-host": "alternate.example.test",
        "x-forwarded-proto": "http://attacker.test/",
      }, peer);
      const outgoing = {};
      globalThis.__clerkProxyOptions.on.proxyReq({
        setHeader(name, value) { outgoing[name] = value; },
      }, result.req);
      assert.equal(outgoing["Clerk-Proxy-Url"], `https://${expected}/api/__clerk`);
      assert.equal(outgoing["Clerk-Secret-Key"], "sk_live_synthetic_no_network");
    }
  } finally {
    delete globalThis.__clerkProxyOptions;
    delete process.env.CLERK_SECRET_KEY;
    process.env.NODE_ENV = "test";
  }
});
