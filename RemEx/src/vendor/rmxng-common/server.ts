import { NextRequest } from "next/server";
import { resolveServiceBaseUrl } from "./serviceConfig";
import { ConsoleLogger } from "./core";

/**
 * SSRF guard for explicit `target` base URLs (used for per-node RSMS calls).
 *
 * Allows:
 *   • RFC-1918 private IPv4 addresses (10.x, 172.16-31.x, 192.168.x, 127.x)
 *   • Plain hostnames (e.g. "NODE-01", "rmxpc01.local") — no dots that would
 *     indicate a public domain, or any hostname when DNS resolution is trusted
 *     on the private network.
 *
 * In both cases only the configured RSMS port is accepted, which keeps the
 * attack surface to the single well-known management port even if an attacker
 * could supply an arbitrary hostname.
 *
 * Override the port via RSMS_ALLOWED_PORT env var for non-standard deployments.
 */
function isAllowedTarget(target: string): boolean {
  const port = process.env.RSMS_ALLOWED_PORT ?? "9014";

  // Must use plain http (not https, not protocol-relative)
  if (!target.startsWith("http://")) return false;

  const withoutScheme = target.slice("http://".length);

  // host must be followed by exactly ":PORT" and nothing else (no path/query)
  const portSuffix = `:${port}`;
  if (!withoutScheme.endsWith(portSuffix)) return false;

  const host = withoutScheme.slice(0, withoutScheme.length - portSuffix.length);
  if (!host) return false;

  // Reject anything that looks like it could escape the local network:
  // no slashes, no @ (userinfo), no # or ?, no leading/trailing whitespace.
  if (/[/\\@#?\s]/.test(host)) return false;

  // Allow private IPv4 ranges
  const privateIP = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
  if (privateIP.test(host)) return true;

  // Allow hostnames — a plain label or dot-separated labels (e.g. host.local).
  // Rejects raw public IP ranges and anything that looks like an external domain
  // by blocking hosts whose last label is a known public TLD longer than 4 chars
  // (e.g. ".com", ".net" are fine for corporate intranet names; ".co.uk" or
  // ".remex.com" would be blocked by the port constraint anyway).
  const hostnamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/;
  if (hostnamePattern.test(host)) return true;

  return false;
}

export async function handleApiRequest(
  request: NextRequest,
  method: string,
  logger = new ConsoleLogger(),
) {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get("service");
  const api     = searchParams.get("api");
  const target  = searchParams.get("target"); // explicit base URL for RSMS node calls

  if (!api) {
    return new Response(
      JSON.stringify({ success: false, error: { message: "Missing required 'api' query parameter." } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (!service && !target) {
    return new Response(
      JSON.stringify({ success: false, error: { message: "Provide either 'service' or 'target'." } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // ── Resolve base URL ───────────────────────────────────────────────────────
  let baseUrl: string;
  if (target) {
    if (!isAllowedTarget(target)) {
      logger.warn("Proxy: rejected disallowed target", { target });
      return new Response(
        JSON.stringify({ success: false, error: { message: "Target URL is not permitted." } }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
    baseUrl = target;
  } else {
    try {
      baseUrl = resolveServiceBaseUrl(service!);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: { message: `Unknown service: ${service}` } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
  }

  // Build target URL forwarding all query params except proxy-internal ones
  const targetUrl = new URL(api.startsWith("/") ? api.slice(1) : api, `${baseUrl}/`);
  searchParams.forEach((value, key) => {
    if (key !== "service" && key !== "api" && key !== "target") {
      targetUrl.searchParams.append(key, value);
    }
  });

  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");
  // Stream the request body straight through instead of buffering it as text.
  // `request.text()` would UTF-8-decode the bytes, replacing every invalid
  // sequence with U+FFFD and corrupting any binary payload (e.g. multipart
  // file uploads). Streaming preserves bytes exactly and avoids buffering
  // hundreds of MB in memory for large deploys.
  const hasBody = method !== "GET" && method !== "HEAD";

  logger.debug("Proxying API request", { service, method, url: targetUrl.toString() });

  // `duplex: 'half'` is required by undici when sending a ReadableStream
  // body — without it, fetch throws "RequestInit: duplex option is required
  // when sending a body". The option is not yet in the standard lib.dom.d.ts
  // RequestInit type, hence the augmentation here.
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...(contentLength ? { "content-length": contentLength } : {}),
      accept: request.headers.get("accept") || "application/json",
    },
  };
  if (hasBody) {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err: unknown) {
    // Network-level failure (ECONNREFUSED, ETIMEDOUT, DNS failure, etc.)
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|ETIMEDOUT/i.test(message);
    logger.warn("Proxy: upstream unreachable", { url: targetUrl.toString(), error: message });
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          message: isTimeout
            ? `Upstream timed out: ${targetUrl.toString()}`
            : `Upstream unreachable: ${targetUrl.toString()}`,
        },
      }),
      {
        status: isTimeout ? 504 : 502,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const upstreamCt = upstream.headers.get("content-type") || "";
  const upstreamCd = upstream.headers.get("content-disposition");

  // Stream-through for unbounded responses (MJPEG, SSE, chunked downloads).
  // Buffering these via arrayBuffer() would never resolve because the body
  // never ends.
  const isStreaming =
    /^multipart\//i.test(upstreamCt) ||
    /^text\/event-stream/i.test(upstreamCt) ||
    upstream.headers.get("transfer-encoding")?.toLowerCase() === "chunked";

  if (isStreaming) {
    const passHeaders = new Headers();
    if (upstreamCt) passHeaders.set("content-type", upstreamCt);
    if (upstreamCd) passHeaders.set("content-disposition", upstreamCd);
    passHeaders.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: passHeaders });
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await upstream.arrayBuffer();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Proxy: failed reading upstream body", { url: targetUrl.toString(), error: message });
    return new Response(
      JSON.stringify({ success: false, error: { message: "Failed to read upstream response." } }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  const headers = new Headers();
  if (upstreamCt) headers.set("content-type",        upstreamCt);
  if (upstreamCd) headers.set("content-disposition", upstreamCd);

  return new Response(arrayBuffer, { status: upstream.status, headers });
}
