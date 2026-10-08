"use client";

import { useState } from "react";
import { buildUrl, callEndpoint } from "@/lib/apiClient";
import LogContentsTable, { isLogContentsRows } from "@/components/LogContentsTable";
import Spinner from "@/components/Spinner";

const METHOD_COLORS = {
  GET: "bg-blue-100 text-blue-700 border-blue-200",
  POST: "bg-green-100 text-green-700 border-green-200",
  PUT: "bg-amber-100 text-amber-700 border-amber-200",
  DELETE: "bg-rose-100 text-rose-700 border-rose-200",
  PATCH: "bg-purple-100 text-purple-700 border-purple-200",
};

// Heuristics for upload/download endpoints (item 11).
//   - upload  : POST endpoints whose label/path contains "import" or
//               "upload", OR any endpoint that declares a `file` param.
//   - download: GET endpoints whose label/path contains "export" or
//               "download".
const isUploadEndpoint = (e) =>
  (e.method === "POST" || e.method === "PUT") &&
  (/import|upload/i.test(e.path) || /import|upload/i.test(e.label) ||
   (e.params && Object.keys(e.params).some((k) => /^file$/i.test(k))));

const isDownloadEndpoint = (e) =>
  e.method === "GET" && (/export|download/i.test(e.path) || /export|download/i.test(e.label));

/**
 * EndpointCard — renders a single REST endpoint with editable params/body
 * and a "Send" button that calls it through the apiClient. Result is shown
 * in a JSON viewer. Upload/download endpoints get a Browse/Save UI in place
 * of the JSON body editor (item 11).
 */
export default function EndpointCard({ service, endpoint, baseOverride }) {
  // Strip the synthetic "file" param off so it doesn't render as a text
  // input — the upload UI handles it via the Browse button below.
  const baseParams = endpoint.params ? { ...endpoint.params } : null;
  if (baseParams) {
    Object.keys(baseParams).forEach((k) => {
      if (k === "file" || /^response$/i.test(k)) delete baseParams[k];
    });
  }
  const [params, setParams] = useState(Object.keys(baseParams || {}).length ? baseParams : null);
  const [body, setBody] = useState(endpoint.body ? JSON.stringify(endpoint.body, null, 2) : "");
  const [file, setFile] = useState(null);
  const [resp, setResp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const upload = isUploadEndpoint(endpoint);
  const download = isDownloadEndpoint(endpoint);

  const onSend = async () => {
    setBusy(true);
    setResp(null);

    let callBody;
    if (upload) {
      if (!file) {
        setResp({ ok: false, status: 0, error: "Please select a file to upload." });
        setBusy(false);
        return;
      }
      callBody = file; // apiClient wraps in FormData
    } else if (body && ["POST", "PUT", "PATCH"].includes(endpoint.method)) {
      try {
        callBody = JSON.parse(body);
      } catch (err) {
        setResp({ ok: false, status: 0, error: `Body is not valid JSON: ${err.message}` });
        setBusy(false);
        return;
      }
    }

    let saveHandle = null;
    const needsFilePicker = download && typeof window !== "undefined" && window.showSaveFilePicker;
    try {
      if (needsFilePicker) {
        saveHandle = await window.showSaveFilePicker({
          suggestedName: endpoint.label || "download",
        });
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setBusy(false);
        return;
      }
      setResp({ ok: false, status: 0, error: String(err?.message || err) });
      setBusy(false);
      return;
    }

    const r = await callEndpoint(service, endpoint, { params, body: callBody, baseOverride });
    setBusy(false);

    // Download: if the response carries a blob, let the user pick where
    // to save it. Falls back to the legacy "Downloads folder" save when the
    // browser doesn't expose showSaveFilePicker (Firefox, Safari, older
    // Chromium without the File System Access API).
    if (r.ok && r.blob) {
      const suggested = (endpoint.label || "download") + suffixFor(r.contentType);
      try {
        if (saveHandle) {
          const writable = await saveHandle.createWritable();
          await writable.write(r.blob);
          await writable.close();
        } else {
          const a = document.createElement("a");
          const url = URL.createObjectURL(r.blob);
          a.href = url;
          a.download = suggested;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        // user cancelled save dialog — surface that as a non-error
        if (err?.name !== "AbortError") setResp({ ok: false, status: 0, error: String(err?.message || err) });
      }
    }
    setResp(r);
  };

  const previewUrl = buildUrl(service, endpoint.path, params || endpoint.params, baseOverride);

  return (
    <div className="border border-gray-200 rounded bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
      >
        <span
          className={`text-[11px] font-mono font-semibold border rounded px-2 py-[1px] ${METHOD_COLORS[endpoint.method] || "bg-gray-100"}`}
        >
          {endpoint.method}
        </span>
        <span className="font-mono text-xs text-gray-700 flex-1 truncate">
          {service.base}
          {endpoint.path}
        </span>
        <span className="text-sm text-gray-700">{endpoint.label}</span>
        {upload ? <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5">upload</span> : null}
        {download ? <span className="text-[10px] uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5">download</span> : null}
        <span className="text-gray-400 text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="border-t border-gray-100 p-3 space-y-3 text-sm">
          <div className="text-xs text-gray-500 font-mono break-all">{previewUrl}</div>

          {params ? (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Query parameters</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(params).map(([k, v]) => (
                  <label key={k} className="block text-xs">
                    <span className="block text-gray-600 mb-0.5">{k}</span>
                    <input
                      type="text"
                      value={v ?? ""}
                      onChange={(e) => setParams({ ...params, [k]: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {upload ? (
            <label className="block text-xs">
              <span className="block text-gray-600 mb-0.5">File to upload</span>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="text-xs file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-rmx-primary file:text-white hover:file:bg-rmx-accent file:cursor-pointer"
                />
                {file ? (
                  <span className="text-[11px] text-gray-600 truncate">
                    {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400">No file chosen — click Browse</span>
                )}
              </div>
            </label>
          ) : !download && ["POST", "PUT", "PATCH"].includes(endpoint.method) ? (
            <label className="block text-xs">
              <span className="block text-gray-600 mb-0.5">Body (JSON)</span>
              <textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
              />
            </label>
          ) : null}

          {download ? (
            <p className="text-[11px] text-gray-500">
              The response will be saved to your browser&apos;s Downloads folder.
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSend}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs bg-rmx-primary text-white rounded hover:bg-rmx-accent disabled:opacity-50"
            >
              {busy && <Spinner size="xs" className="text-white" />}
              {busy ? "Sending…" : upload ? "Upload" : download ? "Download" : "Send request"}
            </button>
            {resp ? (
              <span
                className={`status-pill ${resp.ok ? "up" : "down"}`}
                title={`Latency ${resp.ms ?? "?"} ms`}
              >
                {resp.ok ? "OK" : "ERR"} {resp.status || ""}
              </span>
            ) : null}
            {resp?.blob ? (
              <span className="text-[11px] text-gray-500">
                {Math.round(resp.blob.size / 1024)} KB · saved
              </span>
            ) : null}
          </div>

          {resp && !resp.blob ? (
            isLogContentsRows(resp.data) ? (
              <LogContentsTable rows={resp.data} />
            ) : (
              <pre className="bg-gray-50 border border-gray-200 rounded p-2 text-[11px] overflow-auto max-h-72">
                {typeof resp.data === "string"
                  ? resp.data
                  : JSON.stringify(resp.data ?? resp.error, null, 2)}
              </pre>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function suffixFor(ct) {
  if (!ct) return "";
  if (ct.includes("csv")) return ".csv";
  if (ct.includes("pdf")) return ".pdf";
  if (ct.includes("zip")) return ".zip";
  if (ct.includes("json")) return ".json";
  return "";
}
