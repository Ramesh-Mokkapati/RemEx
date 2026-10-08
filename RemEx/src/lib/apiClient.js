/**
 * Thin HTTP client for the Remote Server Management Service.
 *
 * For private-IP targets, calls are routed through the Next.js proxy at
 * /api/proxy (server-to-server, avoids CORS issues on the LAN).
 *
 * For public/ngrok targets the proxy is unavailable (GitHub Pages is a
 * static export with no server) and would block the request anyway (the
 * allowlist only passes private IPs). In that case the request is made
 * directly from the browser to the public URL.
 */

import { baseUrlFor } from "./services";

// ---------------------------------------------------------------------------
// Private-host detection (mirrors the server-side allowlist in proxy/route.ts)
// ---------------------------------------------------------------------------

const PRIVATE_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^localhost$/i,
];

/** Returns true when hostname is a loopback or RFC-1918 private address. */
export function isPrivateHost(hostname) {
  return PRIVATE_PATTERNS.some((r) => r.test(hostname));
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Build the request URL.
 *
 * - Private target:   /api/proxy?target=<baseOverride>&api=<path>&<params>
 * - Public target:    <baseOverride><service.base><path>?<params>  (direct)
 * - No override:      /api/proxy?service=<slug>&api=<path>&<params>
 */
export const buildUrl = (service, path, params, baseOverride) => {
  // Detect public host (ngrok, cloud VM, etc.) — go direct, skip the proxy
  if (baseOverride) {
    let hostname = "";
    try { hostname = new URL(baseOverride).hostname; } catch { /* invalid URL */ }
    if (hostname && !isPrivateHost(hostname)) {
      const base = baseOverride.endsWith("/") ? baseOverride : baseOverride + "/";
      const apiPath = `${service.base}${path}`.replace(/^\//, "");
      const url = new URL(apiPath, base);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
        });
      }
      return url.toString();
    }
  }

  const proxyBase = "/api/proxy";
  const url = new URL(proxyBase, typeof window !== "undefined" ? window.location.origin : "http://localhost:3300");

  if (baseOverride) {
    url.searchParams.set("target", baseOverride);
  } else {
    url.searchParams.set("service", service.slug);
  }

  // api param = service base + endpoint path, e.g. "/v1/rmxrsms/systeminfo"
  url.searchParams.set("api", `${service.base}${path}`);

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
};

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

export async function callEndpoint(service, endpoint, {
  params, body, baseOverride, headers: extraHeaders,
} = {}) {
  const url = buildUrl(service, endpoint.path, params || endpoint.params, baseOverride);
  const headers = { Accept: "application/json" };

  // ngrok shows a browser-warning interstitial for non-browser requests unless
  // this header is present. It is a no-op for any other host.
  if (baseOverride) {
    let hostname = "";
    try { hostname = new URL(baseOverride).hostname; } catch { /* ignore */ }
    if (hostname && !isPrivateHost(hostname)) {
      headers["ngrok-skip-browser-warning"] = "1";
    }
  }

  if (extraHeaders && typeof extraHeaders === "object") {
    Object.entries(extraHeaders).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") headers[key] = value;
    });
  }

  const init = { method: endpoint.method, headers };

  if (body !== undefined && ["POST", "PUT", "PATCH"].includes(endpoint.method)) {
    if (body instanceof FormData || body instanceof File || body instanceof Blob) {
      init.body = body instanceof FormData ? body : (() => {
        const fd = new FormData();
        fd.append("file", body);
        return fd;
      })();
      headers.Accept = "*/*";
      // browser sets Content-Type with boundary for multipart
    } else {
      headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
  }

  const start = performance.now();
  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    return { ok: false, status: 0, url, error: String(err?.message || err), ms: Math.round(performance.now() - start) };
  }

  const ms = Math.round(performance.now() - start);

  const contentType = response.headers.get("content-type") || "";
  const disposition = response.headers.get("content-disposition") || "";
  const isAttachment = /attachment/i.test(disposition);
  const isBinaryType = /octet-stream|application\/(?:zip|pdf|csv|vnd)|text\/csv|image\/|audio\/|video\//i.test(contentType);

  if (response.ok && (isAttachment || isBinaryType)) {
    const blob = await response.blob();
    const filenameMatch = disposition.match(/filename[^;=\n]*=(?:(['"])([^'"]*)\1|([^;\s]*))/i);
    const filename = filenameMatch ? (filenameMatch[2] || filenameMatch[3] || null) : null;
    return { ok: true, status: response.status, url, blob, contentType, filename, ms };
  }

  const text = await response.text();
  let data = text;
  if (text && contentType.includes("application/json")) {
    try { data = JSON.parse(text); } catch { /* leave as text */ }
  }
  return { ok: response.ok, status: response.status, url, data, ms };
}

// ---------------------------------------------------------------------------
// Probe helpers (no JWT needed — public endpoints)
// ---------------------------------------------------------------------------

export async function probe(service, kind = "live") {
  const url = `${baseUrlFor(service)}/probe/${kind}`;
  const start = performance.now();
  try {
    const res = await fetch(url, { method: "GET", mode: "cors" });
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* leave */ }
    return { ok: res.ok, status: res.status, data, url, ms: Math.round(performance.now() - start) };
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err), url, ms: Math.round(performance.now() - start) };
  }
}

/**
 * Restart a service — calls the public /probe/restart endpoint directly on
 * the service's own port (bypasses the proxy).
 */
export async function restartService(service) {
  const directUrl = `${baseUrlFor(service)}/probe/restart`;
  const start = performance.now();
  try {
    const res = await fetch(directUrl, { method: "POST", mode: "cors" });
    return { ok: res.ok, status: res.status, url: directUrl, ms: Math.round(performance.now() - start) };
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err), url: directUrl, ms: Math.round(performance.now() - start) };
  }
}
