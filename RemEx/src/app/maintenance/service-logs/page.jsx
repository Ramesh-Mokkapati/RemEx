"use client";

import { useMemo, useState } from "react";
import { buildUrl, callEndpoint } from "@/lib/apiClient";
import { services } from "@/lib/services";

function fmt(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ServiceLogsPage() {
  const serviceOptions = useMemo(
    () => [...services].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
  const [serviceSlug, setServiceSlug] = useState(serviceOptions[0]?.slug || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  const selectedService = serviceOptions.find((svc) => svc.slug === serviceSlug);
  const logProxyService = selectedService ? { ...selectedService, base: "" } : null;
  const logsUrl = logProxyService ? buildUrl(logProxyService, "/logs") : "?";

  const loadLogs = async () => {
    if (!logProxyService) return;
    setLoading(true);
    setError("");
    setRows([]);
    const result = await callEndpoint(logProxyService, { method: "GET", path: "/logs" });
    setLoading(false);
    if (!result.ok) {
      setError(`HTTP ${result.status || "network error"}`);
      return;
    }
    const data = Array.isArray(result.data) ? result.data : [result.data];
    setRows(data.filter((item) => item !== undefined && item !== null));
  };

  return (
    <section className="space-y-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-2xl font-semibold text-rmx-primary">Service Logs</h1>
        <p className="text-xs text-gray-500 font-mono">GET {logsUrl}</p>
      </header>

      <div className="bg-white border border-gray-200 rounded p-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-700 font-medium">
          Service
          <select
            value={serviceSlug}
            onChange={(e) => setServiceSlug(e.target.value)}
            className="mt-1 w-full min-w-[320px] border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {serviceOptions.map((svc) => (
              <option key={svc.slug} value={svc.slug}>{svc.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={loadLogs}
          disabled={loading || !logProxyService}
          className="px-4 py-2 text-sm bg-rmx-primary hover:bg-rmx-accent text-white rounded disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load Service Logs"}
        </button>
      </div>

      {error ? (
        <div className="border border-rose-200 bg-rose-50 rounded p-3 text-sm text-rose-700">
          Failed to load service logs: {error}
        </div>
      ) : null}

      <div className="bg-white border border-gray-200 rounded overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-20">#</th>
              <th className="text-left px-3 py-2 font-medium">Log entry</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-gray-400 text-xs">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-gray-400 text-xs">
                  No service logs loaded.
                </td>
              </tr>
            ) : (
              rows.map((entry, index) => (
                <tr key={index} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 align-top text-xs font-mono text-gray-500">{index + 1}</td>
                  <td className="px-3 py-1.5 align-top text-xs font-mono whitespace-pre-wrap break-all">
                    {fmt(entry)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
