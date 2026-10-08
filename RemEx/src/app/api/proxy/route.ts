// In GitHub Pages mode (GITHUB_PAGES=true) this file is compiled to a
// force-static stub that returns 503.  In standalone / server mode it is a
// real forwarding proxy that relays requests from the browser to RemExService.
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic =
  process.env.GITHUB_PAGES === "true" ? "force-static" : "force-dynamic";

// ---------------------------------------------------------------------------
// Allowed target ranges — only private / loopback addresses may be proxied.
// ---------------------------------------------------------------------------
const PRIVATE = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^localhost$/i,
];

function isAllowed(hostname: string) {
  return PRIVATE.some((r) => r.test(hostname));
}

const SKIP_REQ = new Set(["host", "connection", "transfer-encoding", "content-length"]);
const SKIP_RES = new Set(["transfer-encoding", "connection"]);

// ---------------------------------------------------------------------------
// Core proxy handler
// ---------------------------------------------------------------------------
async function proxy(req: NextRequest): Promise<Response> {
  if (process.env.GITHUB_PAGES === "true") {
    return NextResponse.json({ error: "Proxy not available in static build" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const apiPath = sp.get("api");
  const target = sp.get("target");

  if (!target) return NextResponse.json({ error: "No target specified" }, { status: 400 });
  if (!apiPath) return NextResponse.json({ error: "No api path specified" }, { status: 400 });

  let targetUrl: URL;
  try {
    const base = target.endsWith("/") ? target : target + "/";
    const rel = apiPath.startsWith("/") ? apiPath.slice(1) : apiPath;
    targetUrl = new URL(rel, base);
  } catch {
    return NextResponse.json({ error: "Invalid target URL" }, { status: 400 });
  }

  if (!isAllowed(targetUrl.hostname)) {
    return NextResponse.json({ error: "Target not in allowed range" }, { status: 403 });
  }

  // Forward all query params except the proxy-internal ones.
  const skip = new Set(["api", "target", "service"]);
  sp.forEach((v, k) => { if (!skip.has(k)) targetUrl.searchParams.set(k, v); });

  const fwdHeaders = new Headers();
  req.headers.forEach((v, k) => {
    if (!SKIP_REQ.has(k.toLowerCase())) fwdHeaders.set(k, v);
  });

  const init: RequestInit = { method: req.method, headers: fwdHeaders };
  if (!["GET", "HEAD"].includes(req.method) && req.body) {
    init.body = req.body as BodyInit;
    // Node 18 fetch requires duplex for streaming request bodies.
    (init as RequestInit & { duplex: string }).duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), init);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Upstream unreachable: ${msg}` }, { status: 502 });
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!SKIP_RES.has(k.toLowerCase())) resHeaders.set(k, v);
  });

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

export const GET    = proxy;
export const POST   = proxy;
export const PUT    = proxy;
export const DELETE = proxy;
export const PATCH  = proxy;
