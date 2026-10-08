"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, usePathname } from "next/navigation";
import {
  RibbonMenu,
  RibbonTab,
  RibbonGroup,
  RibbonButton,
} from "@/components/ribbon";

// All supported languages.
// `flag`  — emoji, rendered as-is (works on all platforms for RIS sequences).
// `badge` — fallback text badge for subdivision flags that Windows can't render
//           (Wales 🏴󠁧󠁢󠁷󠁬󠁳󠁿 and Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿 use Unicode tag chars unsupported on Windows).
//           When present, badge is shown instead of flag.
const LANGUAGES = [
  { code: "en", label: "English",   flag: "🇬🇧" },
  { code: "ga", label: "Gaeilge",   flag: "🇮🇪" },
  { code: "cy", label: "Cymraeg",   badge: { text: "CY", bg: "#C8102E", color: "#fff" } },
  { code: "gd", label: "Gàidhlig",  badge: { text: "GD", bg: "#0065BD", color: "#fff" } },
  { code: "fr", label: "Français",  flag: "🇫🇷" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
  { code: "pr", label: "Português", flag: "🇵🇹" },
];

// Renders either the emoji flag or the coloured text badge.
function LangIcon({ lang, size = "1rem" }) {
  if (lang.badge) {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size === "1rem" ? 22 : 26,
        height: size === "1rem" ? 16 : 19,
        borderRadius: 3,
        background: lang.badge.bg,
        color: lang.badge.color,
        fontSize: "0.55rem",
        fontWeight: 700,
        letterSpacing: "0.03em",
        flexShrink: 0,
      }}>
        {lang.badge.text}
      </span>
    );
  }
  return <span style={{ fontSize: size }}>{lang.flag}</span>;
}

const LANG_KEY = "remex.language";

function LanguageSwitcher() {
  // useTranslation gives us the i18n instance that is bound to the provider,
  // so language changes propagate correctly through React's rendering cycle.
  const { i18n } = useTranslation();
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  // Restore persisted language once on mount (client-only — avoids SSR mismatch).
  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved !== i18n.language) {
      i18n.changeLanguage(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem(LANG_KEY, code);
    setOpen(false);
  };

  // i18n.language may include a region suffix ("en-GB") — match on prefix.
  const currentCode = LANGUAGES.find((l) => i18n.language?.startsWith(l.code))?.code ?? "en";
  const active      = LANGUAGES.find((l) => l.code === currentCode) ?? LANGUAGES[0];

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change language"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          fontSize: "0.8rem",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          background: "#fff",
          cursor: "pointer",
          fontWeight: 500,
          color: "#374151",
        }}
      >
        <LangIcon lang={active} size="1rem" />
        <span>{active.label}</span>
        <span style={{ fontSize: "0.65rem", color: "#9ca3af" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            minWidth: 170,
            zIndex: 9999,
            padding: "4px 0",
          }}
        >
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === currentCode;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => select(lang.code)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "7px 14px",
                  background: isActive ? "#eff6ff" : "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#1d4ed8" : "#374151",
                }}
              >
                <LangIcon lang={lang} size="1.1rem" />
                <span>{lang.label}</span>
                {isActive && (
                  <span style={{ marginLeft: "auto", color: "#2563eb" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maps the current URL pathname → stable ribbon tab key.
// ---------------------------------------------------------------------------
function getTabKeyFromPath(pathname) {
  if (!pathname || pathname === "/") return "home";
  if (pathname.startsWith("/registry")) return "registry";
  if (
    pathname.startsWith("/nodes/") ||
    pathname.startsWith("/maintenance/") ||
    pathname === "/health" || pathname.startsWith("/health/") ||
    pathname.startsWith("/services/")
  ) return "operations";
  return "home";
}

export default function RmxRibbon() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  // Navigate to the landing page for each tab when it is selected.
  // Keys are the English tab labels (stable identifiers), not translated strings.
  const TAB_LANDING = {
    home: "/",
    operations: "/nodes/remote-actions",
    registry: "/registry",
  };

  // Active tab derived from the current URL so a browser refresh keeps the
  // correct tab highlighted.
  const activeTabLabel = t(`nav.${getTabKeyFromPath(pathname)}`);

  const handleTabChange = (label) => {
    // Map translated tab label back to stable key by comparing with t() output.
    const tabKeys = Object.keys(TAB_LANDING);
    const matchedKey = tabKeys.find((k) => t(`nav.${k}`) === label) ?? label.toLowerCase();
    const href = TAB_LANDING[matchedKey];
    if (href) router.push(href);
  };

  return (
    <RibbonMenu
      brand="RemEx"
      activeTab={activeTabLabel}
      onTabChange={handleTabChange}
      rightSlot={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LanguageSwitcher />
        </div>
      }
    >
      <RibbonTab label={t('nav.home')}>
        <RibbonGroup title={t('nav.workspace')}>
          <RibbonButton caption={t('nav.dashboard')} icon="mif-home" onClick={() => router.push("/")} />
        </RibbonGroup>
        <RibbonGroup title={t('nav.services')}>
          <RibbonButton caption={t('nav.services')} icon="mif-cogs" onClick={() => router.push("/health")} />
        </RibbonGroup>
      </RibbonTab>

      <RibbonTab label={t('nav.operations')}>
        <RibbonGroup title={t('nav.nodes')}>
          <RibbonButton caption="Remote Actions" icon="mif-tree-diagram" onClick={() => router.push("/nodes/remote-actions")} />
        </RibbonGroup>
        <RibbonGroup title="Logs">
          <RibbonButton caption={t('nav.serviceLogs')} icon="mif-server" onClick={() => router.push("/maintenance/service-logs")} />
        </RibbonGroup>
      </RibbonTab>

    </RibbonMenu>
  );
}
