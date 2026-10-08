"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NodeRemoteActionsLauncherPage() {
  const router = useRouter();
  const [ip, setIp] = useState("127.0.0.1");
  const [port, setPort] = useState("9014");

  const onOpen = () => {
    const nodeIp = ip.trim();
    if (!nodeIp) return;
    // GitHub Pages static export only pre-generates /nodes/_ — pass the real
    // host as a query parameter so NodePage can read it client-side.
    const isStaticBuild = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";
    if (isStaticBuild) {
      router.push(
        `/nodes/_?ip=${encodeURIComponent(nodeIp)}&port=${encodeURIComponent(port || "9014")}`
      );
    } else {
      router.push(
        `/nodes/${encodeURIComponent(nodeIp)}?port=${encodeURIComponent(port || "9014")}`
      );
    }
  };

  return (
    <section className="max-w-2xl mx-auto mt-6 space-y-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-semibold text-rmx-primary">Node Remote Actions</h1>
        <p className="text-xs text-gray-500 mt-1">
          Select a node, then open the required input forms.
        </p>
      </header>

      <div className="bg-white border border-gray-200 rounded p-4 space-y-4">
        <label className="block text-xs">
          <span className="block text-gray-600 mb-1">Node IP address</span>
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="e.g. 192.168.1.25"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
        </label>

        <label className="block text-xs">
          <span className="block text-gray-600 mb-1">RSMS port</span>
          <input
            type="text"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
        </label>

        <button
          type="button"
          onClick={onOpen}
          disabled={!ip.trim()}
          className="px-4 py-2 text-sm bg-rmx-primary hover:bg-rmx-accent text-white rounded disabled:opacity-50"
        >
          Open Remote Actions
        </button>
      </div>
    </section>
  );
}
