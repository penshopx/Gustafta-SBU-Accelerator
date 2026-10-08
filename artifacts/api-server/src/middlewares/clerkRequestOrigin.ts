import { BlockList, isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";

// Verified published domain. Other public/custom domains must be registered in
// REPLIT_DOMAINS or explicitly approved by the operator in CLERK_ALLOWED_HOSTS.
const publishedHost = "gustafta-sbu-accelerator.replit.app";

export function normalizeClerkHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(value.trim());
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return undefined;
  const host = match[1].toLowerCase();
  if (host.length > 253 || !host.split(".").every((label) =>
    label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return undefined;
  return host;
}

function entries(value: string | undefined): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

export function clerkRequestOriginMiddleware(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const allowed = new Set([publishedHost]);
  for (const entry of [
    ...entries(env.REPLIT_DOMAINS),
    ...entries(env.CLERK_ALLOWED_HOSTS),
    ...(env.NODE_ENV !== "production" ? ["localhost", "127.0.0.1", ...entries(env.REPLIT_DEV_DOMAIN)] : []),
  ]) {
    const host = normalizeClerkHost(entry);
    if (!host) throw new Error("Invalid Clerk allowed-host configuration");
    allowed.add(host);
  }

  // No automatic trust of loopback/private networks or a hop count: clients
  // reaching the process directly must not impersonate the deployment edge.
  const proxies = new BlockList();
  for (const entry of entries(env.CLERK_TRUSTED_PROXY_CIDRS)) {
    const [address, prefix, extra] = entry.split("/");
    const version = isIP(address);
    if (!version || extra !== undefined ||
      (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error("Invalid Clerk trusted-proxy configuration");
    }
    const family = version === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) proxies.addAddress(address, family);
    else proxies.addSubnet(address, Number(prefix), family);
  }

  return (req, res, next) => {
    const peer = req.socket.remoteAddress?.replace(/^::ffff:/, "");
    const version = peer && isIP(peer);
    const trusted = !!(peer && version && proxies.check(peer, version === 4 ? "ipv4" : "ipv6"));
    const forwarded = req.headers["x-forwarded-host"];
    // Trusted proxies must REPLACE forwarding headers, never append. A chain
    // cannot prove which value was supplied by the client, so reject it.
    const hasForwarded = trusted && forwarded !== undefined && forwarded !== "";
    const host = normalizeClerkHost(hasForwarded
      ? (typeof forwarded === "string" ? forwarded : undefined)
      : req.headers.host);
    if (!host || !allowed.has(host)) {
      res.setHeader("Cache-Control", "private, no-store");
      res.status(421).json({ error: "Domain permintaan tidak diizinkan.", code: "untrusted_host" });
      return;
    }

    // Sanitize BEFORE both Clerk SDK and FAPI proxy: the SDK also reads these
    // headers independently of our publishable-key callback.
    req.headers.host = host;
    req.headers["x-forwarded-host"] = host;
    req.headers["x-forwarded-proto"] = "https";
    delete req.headers.forwarded;
    if (!trusted) {
      delete req.headers["x-forwarded-for"];
      delete req.headers["x-forwarded-port"];
    }
    next();
  };
}

/** Only reads the canonical header produced by the origin middleware. */
export function getClerkProxyHost(req: { headers: IncomingHttpHeaders }): string | undefined {
  return req.headers.host;
}
