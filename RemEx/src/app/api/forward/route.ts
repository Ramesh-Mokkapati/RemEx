import { NextRequest } from "next/server";
import { handleApiRequest } from "@/vendor/rmxng-common/server";

// Force the Node.js runtime (not Edge) — we stream the request body straight
// to the upstream service via undici fetch, which needs Node streams and
// duplex: 'half'.
export const runtime = "nodejs";

// Never statically optimise — every request must hit the proxy.
// In GitHub Pages mode (static export) this must be force-static; there is no
// server to handle requests, so the route compiles to a 503 stub.
export const dynamic =
  process.env.GITHUB_PAGES === "true" ? "force-static" : "force-dynamic";

// Large binary uploads can run well past the default 10 s serverless
// function timeout. Raise the ceiling so the stream has time to flush.
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  return await handleApiRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return await handleApiRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return await handleApiRequest(request, "PUT");
}

export async function DELETE(request: NextRequest) {
  return await handleApiRequest(request, "DELETE");
}