"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { services } from "@/lib/services";
import { probe, restartService } from "@/lib/apiClient";
import Spinner from "@/components/Spinner";

export default function HealthPage() {
  const { t } = useTranslation();
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  // restartStatus: { [slug]: "idle" | "pending" | "ok" | "error" }
  const [restartStatus, setRestartStatus] = useState({});
  const [restartingAll, setRestartingAll] = useState(false);

  const runAll = async () => {
    setLoading(true);
    const out = {};
    await Promise.all(
      services.map(async (s) => {
        out[s.slug] = { live: await probe(s, "live"), ready: await probe(s, "ready") };
      })
    );
    setResults(out);
    setLoading(false);
  };

  const restart = async (s) => {
    setRestartStatus((prev) => ({ ...prev, [s.slug]: "pending" }));
    const result = await restartService(s);
    setRestartStatus((prev) => ({ ...prev, [s.slug]: result.ok ? "ok" : "error" }));
  };

  const restartAll = async () => {
    setRestartingAll(true);
    const pending = {};
    services.forEach((s) => { pending[s.slug] = "pending"; });
    setRestartStatus(pending);
    await Promise.all(services.map(async (s) => {
      const result = await restartService(s);
      setRestartStatus((prev) => ({ ...prev, [s.slug]: result.ok ? "ok" : "error" }));
    }));
    setRestartingAll(false);
  };

  useEffect(() => {
    runAll();
  }, []);

  const restartBtnLabel = (slug) => {
    const st = restartStatus[slug];
    if (st === "pending") return t('health.restarting');
    if (st === "ok") return t('health.restarted');
    if (st === "error") return t('health.failed');
    return t('health.restart');
  };

  const restartBtnClass = (slug) => {
    const st = restartStatus[slug];
    const base = "px-2 py-0.5 text-xs border rounded";
    if (st === "pending") return `${base} border-gray-300 text-gray-400 cursor-not-allowed`;
    if (st === "ok") return `${base} border-green-400 text-green-700 bg-green-50`;
    if (st === "error") return `${base} border-red-400 text-red-700 bg-red-50`;
    return `${base} border-orange-300 text-orange-700 hover:bg-orange-50`;
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-rmx-primary">{t('health.title')}</h1>
          <p className="text-sm text-gray-600">
            {t('health.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Spinner size="xs" /> : "↻"}
            {loading ? t('health.probing') : t('health.refresh')}
          </button>
          <button
            onClick={restartAll}
            disabled={loading || restartingAll}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-sm border border-orange-400 text-orange-700 rounded hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {restartingAll && <Spinner size="xs" className="text-orange-700" />}
            {restartingAll ? t('health.restartingAll') : t('health.restartAll')}
          </button>
        </div>
      </header>

      <div className="overflow-x-auto bg-white border border-gray-200 rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">{t('health.service')}</th>
              <th className="text-left px-3 py-2">{t('health.code')}</th>
              <th className="text-left px-3 py-2">{t('health.port')}</th>
              <th className="text-left px-3 py-2">{t('health.live')}</th>
              <th className="text-left px-3 py-2">{t('health.ready')}</th>
              <th className="text-left px-3 py-2">{t('health.latency')}</th>
              <th className="text-left px-3 py-2">{t('health.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => {
              const r = results[s.slug];
              const live = r?.live;
              const ready = r?.ready;
              const pill = (p) => {
                if (!p) return <span className="status-pill unknown">…</span>;
                if (p.ok) return <span className="status-pill up">UP {p.status}</span>;
                if (p.status) return <span className="status-pill down">DOWN {p.status}</span>;
                return <span className="status-pill down">DOWN</span>;
              };
              return (
                <tr key={s.slug} className="border-t border-gray-100">
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.port}</td>
                  <td className="px-3 py-2">{pill(live)}</td>
                  <td className="px-3 py-2">{pill(ready)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {live ? `${live.ms} ms` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => restart(s)}
                      disabled={loading || restartStatus[s.slug] === "pending"}
                      className={`inline-flex items-center gap-1.5 ${restartBtnClass(s.slug)} ${loading && restartStatus[s.slug] !== "pending" ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      {restartStatus[s.slug] === "pending" && <Spinner size="xs" className="text-gray-400" />}
                      {restartBtnLabel(s.slug)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
