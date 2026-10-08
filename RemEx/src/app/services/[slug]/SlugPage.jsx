"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { findService, baseUrlFor } from "@/lib/services";
import EndpointCard from "@/components/EndpointCard";
import { probe } from "@/lib/apiClient";

export default function ServicePage({ params }) {
  const service = findService(params.slug);

  // Pre-fill the endpoint filter from ?filter=…
  //
  // Reading via window.location.search instead of next/navigation's
  // useSearchParams() — the hook gets baked into every page bundle that
  // shares a chunk with this one and trips Next.js 14's static prerender
  // on /login (see CSR-bailout error). Pathname changes still re-run the
  // effect, so navigation between filtered ribbon buttons keeps working.
  const pathname = usePathname();
  const [filter, setFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [health, setHealth] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setFilter(p.get("filter") || "");
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    probe(service, "live").then((r) => !cancelled && setHealth(r));
    return () => {
      cancelled = true;
    };
  }, [service]);

  const endpoints = useMemo(() => {
    return service.endpoints.filter((e) => {
      if (methodFilter !== "ALL" && e.method !== methodFilter) return false;
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        e.label.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q)
      );
    });
  }, [service, filter, methodFilter]);

  const methods = useMemo(
    () => ["ALL", ...Array.from(new Set(service.endpoints.map((e) => e.method)))],
    [service]
  );

  if (!service) return null;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-rmx-primary">{service.name}</h1>
          <p className="text-sm text-gray-600">{service.summary}</p>
          <p className="text-xs text-gray-500 mt-1 font-mono">
            {baseUrlFor(service)}
            {service.base}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-mono">code: {service.code}</span>
          <span className="font-mono">port: {service.port}</span>
          {health ? (
            <span className={`status-pill ${health.ok ? "up" : "down"}`}>
              {health.ok ? "UP" : "DOWN"}
            </span>
          ) : (
            <span className="status-pill unknown">probing…</span>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded p-2">
        <input
          type="search"
          placeholder="Filter endpoints…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-300 rounded px-2 py-1 text-sm"
        />
        {filter ? (
          <button
            type="button"
            onClick={() => setFilter("")}
            className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50"
            title="Clear filter"
          >
            Clear
          </button>
        ) : null}
        <div className="flex items-center gap-1">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethodFilter(m)}
              className={`px-2 py-1 text-xs rounded border ${
                m === methodFilter
                  ? "bg-rmx-primary text-white border-rmx-primary"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {endpoints.length} of {service.endpoints.length} endpoints
        </span>
      </div>

      <ul className="space-y-2">
        {endpoints.map((e, i) => (
          <li key={`${e.method}-${e.path}-${i}`}>
            <EndpointCard service={service} endpoint={e} />
          </li>
        ))}
        {endpoints.length === 0 ? (
          <li className="text-sm text-gray-500 italic px-2">No endpoints match the current filter.</li>
        ) : null}
      </ul>
    </section>
  );
}
