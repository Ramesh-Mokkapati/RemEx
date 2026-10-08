"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

// This prototype only surfaces Remote Server Management. Labels/descriptions
// are looked up via i18n at render time using stable keys; only `href`,
// `icon` and the service `key` live here.
const TAB_SUMMARIES = [
  {
    key: "operations",
    icon: "🖥️",
    href: "/nodes/remote-actions",
    services: [
      { key: "remoteActions", href: "/nodes/remote-actions" },
      { key: "serviceLogs", href: "/maintenance/service-logs" },
    ],
  },
  {
    key: "administration",
    icon: "🛡️",
    href: "/health",
    services: [
      { key: "healthOverview", href: "/health" },
    ],
  },
];

export default function DashboardPage() {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-rmx-primary">{t("dashboard.title")}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("dashboard.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TAB_SUMMARIES.map((tab) => {
          const tabLabel = t(`dashboard.tabs.${tab.key}.label`);
          const tabDescription = t(`dashboard.tabs.${tab.key}.description`);
          const cardInner = (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{tab.icon}</span>
                <span className="text-sm font-semibold text-rmx-primary">
                  {tabLabel}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mb-3">
                {tabDescription}
              </p>
              <ul className="flex flex-wrap gap-1">
                {tab.services.map((s) => {
                  const label = t(`dashboard.services.${s.key}`, s.key);
                  return (
                    <li key={s.key}>
                      <Link
                        href={s.href}
                        className="text-[11px] bg-rmx-primary/10 text-rmx-primary rounded px-2 py-0.5 hover:bg-rmx-primary hover:text-white transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          );

          const cardClass = "border rounded-lg p-4 transition border-rmx-primary/30 bg-white hover:shadow-md hover:border-rmx-primary/60";

          return (
            <Link key={tab.key} href={tab.href} className={`block ${cardClass}`}>
              {cardInner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
