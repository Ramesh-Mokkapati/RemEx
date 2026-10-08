"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { findService, baseUrlFor } from "@/lib/services";
import { callEndpoint, isPrivateHost } from "@/lib/apiClient";
import LogContentsTable, { isLogContentsRows } from "@/components/LogContentsTable";
import Spinner from "@/components/Spinner";

// Labels that are handled by dedicated custom tab UIs — excluded from generic cards.
const CUSTOM_LABELS = new Set([
  // File Manager tab (these were previously shown under Commands/Files & Folders)
  "filecontents",
  "listdirectory",
  "allfiles",
  "uploadfile",
  "renamefile",
  "deletefile",
  "downloadfile",
  "downloadfolder",
  "allrmxfolders",
  "rmxdatafolders",
  "createfolder",
  "deletefolder",
  "renamefolder",
  "executecommand",
  // Services tab
  "services",
  "stopservice",
  "startservice",
  "restartservice",
  // Installed Apps tab
  "installedapps",
  "uninstallapp",
  // Environment Variables tab
  "list-envvars",
  "set-envvar",
  "delete-envvar",
  // Startup Applications tab
  "list-startupapps",
  "add-startupapp",
  "delete-startupapp",
  "toggle-startupapp",
  // Surfaced on the Nodes card instead
  "rmxversion",
  "allalertcount",
  // Not needed anywhere in Remote Actions
  "allalertfiles",
]);

const HIDDEN_COMMAND_LABELS = new Set([
  "rmxemcdirs",
  "vrecmetadata",
  "vrecimage",
  "vrecthumbnail",
  "vrecthumbnail/save",
  "movevrec",
]);

const GROUPS = [
  { key: "info", label: "System Info", test: (e) => /info$/.test(e.label) },
  { key: "installed-apps", label: "Installed Apps", custom: true, test: () => false },
  { key: "file-manager", label: "File Manager", custom: true, test: () => false },
  { key: "services", label: "Services", custom: true, test: () => false },
  { key: "scheduled-tasks", label: "Scheduled Tasks", custom: true, test: (e) => /task/.test(e.label) && !/createfolder|deletefolder|renamefolder/.test(e.label) },
  { key: "env-vars", label: "Environment Variables", custom: true, test: () => false },
  { key: "registry", label: "Registry", custom: true, test: () => false },
  { key: "reg-scanner", label: "Reg Scanner", custom: true, test: () => false },
  { key: "startup-apps", label: "Startup Apps", custom: true, test: () => false },
];

const PARAM_FILE = /^file$/i;
const PARAM_RESPONSE = /^response$/i;

function titleize(label) {
  return label
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultParams(endpoint, nodeIp) {
  const params = { ...(endpoint.params || {}) };
  for (const key of Object.keys(params)) {
    if (PARAM_FILE.test(key) || PARAM_RESPONSE.test(key)) {
      delete params[key];
      continue;
    }
    if (/^ipaddress$/i.test(key)) params[key] = nodeIp;
  }
  return Object.keys(params).length ? params : null;
}

function isUploadEndpoint(endpoint) {
  const hasFileParam = endpoint.params && Object.keys(endpoint.params).some((k) => PARAM_FILE.test(k));
  return (endpoint.method === "POST" || endpoint.method === "PUT") && (hasFileParam || /upload|deploy|config/i.test(endpoint.label));
}

function isReadonlyIpField(name) {
  return /^ipaddress$/i.test(name);
}

function renderResponseData(endpoint, data) {
  if (isLogContentsRows(data)) {
    return <LogContentsTable rows={data} />;
  }

  return (
    <pre className="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px]">
      {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

function ActionCard({ service, endpoint, baseOverride, nodeIp }) {
  const [params, setParams] = useState(() => defaultParams(endpoint, nodeIp));
  const [body, setBody] = useState(endpoint.body ? JSON.stringify(endpoint.body, null, 2) : "");
  const [file, setFile] = useState(null);
  const [resp, setResp] = useState(null);
  const [busy, setBusy] = useState(false);
  const upload = isUploadEndpoint(endpoint);

  const run = async () => {
    setBusy(true);
    setResp(null);

    let callBody;
    if (upload) {
      if (!file) {
        setResp({ ok: false, status: 0, error: "Choose a file first." });
        setBusy(false);
        return;
      }
      callBody = file;
    } else if (body && ["POST", "PUT", "PATCH"].includes(endpoint.method)) {
      try {
        callBody = JSON.parse(body);
      } catch (err) {
        setResp({ ok: false, status: 0, error: `Body is not valid JSON: ${err.message}` });
        setBusy(false);
        return;
      }
    }

    const result = await callEndpoint(service, endpoint, { params, body: callBody, baseOverride });
    if (result.ok && result.blob) {
      const a = document.createElement("a");
      const url = URL.createObjectURL(result.blob);
      a.href = url;
      a.download = result.filename || `${endpoint.label || "download"}.bin`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    setResp(result);
    setBusy(false);
  };

  return (
    <article className="rounded border border-gray-200 bg-white p-3 space-y-3">
      <header>
        <h3 className="text-sm font-semibold text-rmx-primary">{titleize(endpoint.label)}</h3>
      </header>

      {params ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(params).map(([k, v]) => (
            <label key={k} className="block text-xs">
              <span className="block text-gray-600 mb-1">{k}</span>
              <input
                type="text"
                value={v ?? ""}
                readOnly={isReadonlyIpField(k)}
                onChange={(e) => setParams({ ...params, [k]: e.target.value })}
                className={`w-full rounded border px-2 py-1 text-xs font-mono ${isReadonlyIpField(k) ? "border-gray-200 bg-gray-100 text-gray-600" : "border-gray-300"}`}
              />
            </label>
          ))}
        </div>
      ) : null}

      {upload ? (
        <label className="block text-xs">
          <span className="block text-gray-600 mb-1">File</span>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-xs file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-rmx-primary file:text-white hover:file:bg-rmx-accent file:cursor-pointer"
          />
        </label>
      ) : endpoint.body && ["POST", "PUT", "PATCH"].includes(endpoint.method) ? (
        <label className="block text-xs">
          <span className="block text-gray-600 mb-1">Request data (JSON)</span>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
          />
        </label>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-rmx-primary text-white hover:bg-rmx-accent disabled:opacity-50"
        >
          {busy && <Spinner size="xs" className="text-white" />}
          {busy ? "Running…" : "Run"}
        </button>
        {resp ? (
          <span className={`status-pill ${resp.ok ? "up" : "down"}`}>
            {resp.ok ? "OK" : "ERR"} {resp.status || ""}
          </span>
        ) : null}
      </div>

      {resp && !resp.blob ? renderResponseData(endpoint, resp.data ?? resp.error) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// File Manager Tab
// ---------------------------------------------------------------------------

// Empty string is the virtual "This PC" root — the backend's /listdirectory
// returns the list of available drives when Folder is omitted, so File
// Manager can browse the whole machine instead of being confined to one
// fixed folder.
const ROOT_PATH = "";

function fileIcon(item) {
  if (item.isDirectory) return (
    <svg className="w-8 h-8 text-yellow-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
    </svg>
  );
  const ext = item.name.split(".").pop().toLowerCase();
  const color =
    ["exe","dll","bat","cmd"].includes(ext) ? "text-red-400" :
    ["cfg","rmx","ini","msg","xml","json"].includes(ext) ? "text-blue-400" :
    ["log","txt","csv"].includes(ext) ? "text-gray-400" :
    ["zip","gz","tar"].includes(ext) ? "text-purple-400" :
    ["jpg","jpeg","png","bmp","gif"].includes(ext) ? "text-green-400" :
    "text-gray-500";
  return (
    <svg className={`w-8 h-8 ${color} flex-shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
  );
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString();
}

function FileManagerTab({ service, baseOverride }) {
  const [path, setPath] = useState(ROOT_PATH);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  // rename state
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  // new folder
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  // file preview
  const [preview, setPreview] = useState(null);
  // context menu
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, item }
  // file upload
  const [uploading, setUploading] = useState(false);
  // command terminal
  const [cmd, setCmd] = useState("");
  const [cmdOutput, setCmdOutput] = useState([]);
  const [cmdBusy, setCmdBusy] = useState(false);
  // display labels for drive roots, e.g. { "C:": "OS (C:)" }, populated
  // whenever the virtual "This PC" root is loaded — used to label the first
  // breadcrumb segment the way File Explorer does.
  const [driveLabels, setDriveLabels] = useState({});

  const load = useCallback(async (dir) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    const r = await callEndpoint(service, { method: "GET", path: "/listdirectory", label: "listdirectory" }, { params: { Folder: dir }, baseOverride });
    setLoading(false);
    if (r.ok && Array.isArray(r.data)) {
      setItems(r.data);
      if (!dir) {
        setDriveLabels(Object.fromEntries(r.data.map((d) => [d.path, d.name])));
      }
    } else {
      setError(r.data?.message || r.error || `Failed to list directory (HTTP ${r.status})`);
      setItems([]);
    }
  }, [service, baseOverride]);

  useEffect(() => { load(path); }, [load, path]);

  const navigate = (item) => {
    if (!item.isDirectory) return;
    setPath(item.path);
  };

  // Breadcrumbs from path. Empty path = virtual "This PC" root (all drives),
  // so it contributes no crumbs of its own.
  const crumbs = useMemo(() => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.map((p, i) => ({
      label: i === 0 && driveLabels[p] ? driveLabels[p] : p,
      path: parts.slice(0, i + 1).join("/"),
    }));
  }, [path, driveLabels]);

  const goUp = () => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    // One level up from a drive root (e.g. "C:") is the virtual "This PC"
    // root, represented by the empty string — not falsy-guarded away.
    setPath(parts.slice(0, -1).join("/"));
  };

  const downloadItem = async (item) => {
    const endpoint = item.isDirectory
      ? { method: "GET", path: "/downloadfolder", label: "downloadfolder" }
      : { method: "GET", path: "/downloadfile",   label: "downloadfile"   };
    const params = item.isDirectory ? { Folder: item.path } : { File: item.path };
    const r = await callEndpoint(service, endpoint, { params, baseOverride });
    if (r.ok && r.blob) {
      const filename = r.filename || (item.name + (item.isDirectory ? ".zip" : ""));
      if (typeof window.showSaveFilePicker === "function") {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: filename });
          const writable = await handle.createWritable();
          await writable.write(r.blob);
          await writable.close();
        } catch (err) {
          if (err?.name !== "AbortError") {
            const a = document.createElement("a");
            const url = URL.createObjectURL(r.blob);
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
          }
        }
      } else {
        const a = document.createElement("a");
        const url = URL.createObjectURL(r.blob);
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
    }
  };

  const deleteItem = async (item) => {
    if (!confirm(`Delete ${item.isDirectory ? "folder" : "file"} "${item.name}"?`)) return;
    const endpoint = item.isDirectory
      ? { method: "DELETE", path: "/deletefolder", label: "deletefolder" }
      : { method: "DELETE", path: "/deletefile",   label: "deletefile"   };
    const params = item.isDirectory ? { Folder: item.path } : { Source: item.path };
    const r = await callEndpoint(service, endpoint, { params, baseOverride });
    if (r.ok) load(path);
    else alert(`Delete failed: ${r.data || r.error}`);
  };

  const startRename = (item) => {
    setRenaming(item);
    setRenameValue(item.name);
  };

  const commitRename = async () => {
    if (!renaming || !renameValue.trim() || renameValue === renaming.name) { setRenaming(null); return; }
    const parentPath = path.replace(/\\/g, "/");
    const newPath = parentPath + "/" + renameValue.trim();
    const endpoint = renaming.isDirectory
      ? { method: "POST", path: "/renamefolder", label: "renamefolder" }
      : { method: "POST", path: "/renamefile",   label: "renamefile"   };
    const params = renaming.isDirectory
      ? { SourceFolder: renaming.path, TargetFolder: newPath }
      : { Source: renaming.path, Target: newPath };
    const r = await callEndpoint(service, endpoint, { params, baseOverride });
    setRenaming(null);
    if (r.ok) load(path);
    else alert(`Rename failed: ${r.data || r.error}`);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const folderPath = path.replace(/\\/g, "/") + "/" + newFolderName.trim();
    const r = await callEndpoint(service, { method: "POST", path: "/createfolder", label: "createfolder" }, { params: { SourceFolder: folderPath }, baseOverride });
    setCreatingFolder(false);
    setNewFolderName("");
    if (r.ok) load(path);
    else alert(`Create folder failed: ${r.data || r.error}`);
  };

  const viewFile = async (item) => {
    const r = await callEndpoint(service,
      { method: "GET", path: "/filecontents", label: "filecontents", params: { Folder: "", File: "" } },
      { params: { Folder: item.path }, baseOverride });
    if (r.ok && typeof r.data === "string") setPreview({ name: item.name, content: r.data });
    else alert(`Cannot view file: ${r.data || r.error}`);
  };

  const runCommand = async () => {
    if (!cmd.trim()) return;
    setCmdBusy(true);
    const r = await callEndpoint(service, { method: "POST", path: "/executecommand", label: "executecommand" }, { params: { Command: cmd }, baseOverride });
    setCmdBusy(false);
    if (r.ok && Array.isArray(r.data)) {
      setCmdOutput((prev) => [...prev, { cmd, lines: r.data }]);
    } else {
      setCmdOutput((prev) => [...prev, { cmd, lines: [`Error: ${r.data || r.error}`] }]);
    }
    setCmd("");
  };

  const isTextFile = (name) => /\.(txt|log|cfg|rmx|ini|xml|json|csv|msg|bat|cmd|ps1|sh)$/i.test(name);

  return (
    <div className="space-y-3">
      {/* Command terminal — at the top for quick access */}
      <details className="border border-gray-200 rounded" open>
        <summary className="px-3 py-2 text-xs font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-50">
          Terminal (Execute Command)
        </summary>
        <div className="p-3 space-y-2">
          <div className="bg-gray-900 text-green-400 rounded p-2 font-mono text-[11px] max-h-48 overflow-auto space-y-1">
            {cmdOutput.length === 0 && <span className="text-gray-600">No output yet.</span>}
            {cmdOutput.map((entry, i) => (
              <div key={i}>
                <div className="text-gray-400">$ {entry.cmd}</div>
                {entry.lines.map((l, j) => <div key={j}>{l || " "}</div>)}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={cmd} onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !cmdBusy && runCommand()}
              placeholder="e.g. C:\RMX\rmxutil.exe version"
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono" />
            <button onClick={runCommand} disabled={cmdBusy || !cmd.trim()}
              className="px-3 py-1 text-xs bg-rmx-primary text-white rounded disabled:opacity-50">
              {cmdBusy ? "…" : "Run"}
            </button>
            <button onClick={() => setCmdOutput([])}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Clear</button>
          </div>
          <p className="text-[10px] text-gray-400">Enter the full executable path. Shell commands (dir, cd) are not supported — use RMX executables directly.</p>
        </div>
      </details>

      {/* Path bar */}
      <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded px-2 py-1 flex-wrap">
        <button onClick={() => setPath(ROOT_PATH)} className="text-xs text-rmx-accent hover:underline font-mono">💻 This PC</button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-gray-400 text-xs">/</span>
            <button onClick={() => setPath(c.path)} className="text-xs text-rmx-accent hover:underline font-mono">{c.label}</button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={goUp} disabled={path === ROOT_PATH} title="Go up" className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40">↑</button>
          <button onClick={() => load(path)} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100">↻</button>
          <button onClick={() => setCreatingFolder(true)} disabled={path === ROOT_PATH} title={path === ROOT_PATH ? "Navigate into a drive first" : ""} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40">+ Folder</button>
          <label className={`px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 cursor-pointer ${uploading || path === ROOT_PATH ? "opacity-50 pointer-events-none" : ""}`}>
            {uploading ? "Uploading…" : "↑ Upload"}
            <input type="file" className="hidden" disabled={uploading} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              const r = await callEndpoint(service, { method: "POST", path: "/uploadfile", label: "uploadfile" }, { params: { Folder: path }, body: file, baseOverride });
              setUploading(false);
              e.target.value = "";
              if (r.ok) load(path);
              else alert(`Upload failed: ${r.data || r.error}`);
            }} />
          </label>
        </div>
      </div>

      {/* New folder input */}
      {creatingFolder && (
        <div className="flex items-center gap-2">
          <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
            placeholder="New folder name" className="border border-gray-300 rounded px-2 py-1 text-xs font-mono flex-1" />
          <button onClick={createFolder} className="px-3 py-1 text-xs bg-rmx-primary text-white rounded">Create</button>
          <button onClick={() => setCreatingFolder(false)} className="px-3 py-1 text-xs border border-gray-300 rounded">Cancel</button>
        </div>
      )}

      {/* Error */}
      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}

      {/* File grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
          <Spinner size="md" />
          <span className="text-xs">Loading directory…</span>
        </div>
      ) : (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 w-8"></th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2 w-24">Size</th>
                <th className="text-left px-3 py-2 w-40">Modified</th>
                <th className="px-3 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-6">Empty folder</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.path}
                  onClick={() => {
                    setCtxMenu(null);
                    if (item.isDirectory) {
                      navigate(item);
                    } else if (isTextFile(item.name)) {
                      viewFile(item);
                    } else {
                      setSelected(selected?.path === item.path ? null : item);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({ x: e.clientX, y: e.clientY, item });
                  }}
                  className={`border-t border-gray-100 cursor-pointer transition-colors ${selected?.path === item.path ? "bg-rmx-primary/10" : "hover:bg-gray-50"}`}>
                  <td className="px-3 py-1.5">{fileIcon(item)}</td>
                  <td className="px-3 py-1.5 font-mono">
                    {renaming?.path === item.path ? (
                      <input autoFocus value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="border border-rmx-primary rounded px-1 py-0.5 text-xs w-full" />
                    ) : (
                      <span className={item.isDirectory ? "font-medium text-gray-800" : isTextFile(item.name) ? "text-rmx-accent hover:underline" : "text-gray-700"}>
                        {item.name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{fmtSize(item.size)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{fmtDate(item.lastModified)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={(e) => { e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, item }); }}
                      className="text-gray-400 hover:text-gray-700 px-1">&#8942;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 text-xs min-w-[140px]"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}>
            {ctxMenu.item.isDirectory ? (
              <>
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                  onClick={() => { navigate(ctxMenu.item); setCtxMenu(null); }}>
                  Open
                </button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                  onClick={() => { downloadItem(ctxMenu.item); setCtxMenu(null); }}>
                  Download as ZIP
                </button>
              </>
            ) : (
              <>
                {isTextFile(ctxMenu.item.name) && (
                  <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                    onClick={() => { viewFile(ctxMenu.item); setCtxMenu(null); }}>
                    Open
                  </button>
                )}
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                  onClick={() => { downloadItem(ctxMenu.item); setCtxMenu(null); }}>
                  Download
                </button>
              </>
            )}
            {path !== ROOT_PATH && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                  onClick={() => { startRename(ctxMenu.item); setCtxMenu(null); }}>
                  Rename
                </button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-rose-600"
                  onClick={() => { deleteItem(ctxMenu.item); setCtxMenu(null); }}>
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* File preview modal */}
      {preview && (
        <div className="border border-gray-200 rounded bg-white">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-700 font-mono">{preview.name}</span>
            <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-gray-700">✕ Close</button>
          </div>
          <pre className="p-3 text-[11px] font-mono overflow-auto max-h-64 bg-gray-50 whitespace-pre-wrap break-all">
            {preview.content}
          </pre>
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Installed Apps Tab
// ---------------------------------------------------------------------------

function InstalledAppsTab({ service, baseOverride }) {
  const { t } = useTranslation();
  const [apps, setApps]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [uninstalling, setUninstalling] = useState(null);
  const [uninstallMsg, setUninstallMsg] = useState({});
  const [confirmApp, setConfirmApp] = useState(null);

  const appName       = (a) => a.DisplayName    ?? a.Name        ?? a.name        ?? "";
  const appVersion    = (a) => a.DisplayVersion ?? a.Version     ?? a.version     ?? "";
  const appPublisher  = (a) => a.Publisher      ?? a.publisher   ?? "";
  const appCanUninstall = (a) => {
    if (a.CanUninstall  != null) return a.CanUninstall;
    if (a.canUninstall  != null) return a.canUninstall;
    if (a.UninstallString || a.uninstallString) return true;
    return false;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await callEndpoint(
      service,
      { method: "GET", path: "/installedapps", label: "installedapps" },
      { baseOverride },
    );
    setLoading(false);
    if (r.ok && Array.isArray(r.data)) {
      if (r.data.length > 0) console.log("[InstalledApps] sample entry:", r.data[0]);
      setApps(r.data);
    } else {
      setError(r.data?.message || r.error || `Failed to load apps (HTTP ${r.status})`);
    }
  }, [service, baseOverride]);

  useEffect(() => { load(); }, [load]);

  const doUninstall = async (app) => {
    const name = appName(app);
    setConfirmApp(null);
    setUninstalling(name);
    setUninstallMsg((p) => ({ ...p, [name]: null }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/uninstallapp", label: "uninstallapp" },
      { params: { Name: name }, baseOverride },
    );
    setUninstalling(null);
    setUninstallMsg((p) => ({
      ...p,
      [name]: { ok: r.ok, text: r.ok ? "Uninstalled" : (typeof r.data === "string" ? r.data : r.error || "Failed") },
    }));
    if (r.ok) setTimeout(load, 1500);
  };

  const filtered = apps.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return appName(a).toLowerCase().includes(q) ||
           appPublisher(a).toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      {confirmApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg border border-gray-200 shadow-xl p-5 max-w-sm w-full space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">{t('remoteActions.confirmUninstall')}</h3>
            <p className="text-xs text-gray-600">
              {t('remoteActions.uninstall')} <span className="font-medium text-gray-900">{appName(confirmApp)}</span>?
              {appVersion(confirmApp) ? ` (v${appVersion(confirmApp)})` : ""} {t('remoteActions.cannotUndo')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmApp(null)}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                {t('common.cancel')}
              </button>
              <button onClick={() => doUninstall(confirmApp)}
                className="px-3 py-1 text-xs bg-rose-600 text-white rounded hover:bg-rose-700">
                {t('remoteActions.uninstall')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Filter by name or publisher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={loading}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-rmx-primary disabled:opacity-50"
        />
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} of {apps.length}</span>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50">
          {loading ? <><Spinner size="xs" />{t('remoteActions.loading')}</> : `↻ ${t('remoteActions.refresh')}`}
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>
      )}

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2">Application</th>
              <th className="text-left px-3 py-2 w-32">Version</th>
              <th className="text-left px-3 py-2 w-44">Publisher</th>
              <th className="px-3 py-2 w-28 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <div className="inline-flex flex-col items-center gap-3 text-gray-400">
                    <Spinner size="xl" />
                    <span className="text-xs">Loading installed applications…</span>
                  </div>
                </td>
              </tr>
            ) : !error && filtered.length === 0 && apps.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-6 text-xs">{t('remoteActions.noApps')}</td>
              </tr>
            ) : !error && filtered.length === 0 && apps.length > 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-6 text-xs">{t('remoteActions.noMatch')}</td>
              </tr>
            ) : (
              filtered.map((app, idx) => {
                const name  = appName(app);
                const ver   = appVersion(app);
                const pub   = appPublisher(app);
                const canUn = appCanUninstall(app);
                const busy  = uninstalling === name;
                const msg   = uninstallMsg[name];
                return (
                  <tr key={name || idx} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{name}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">
                      {ver || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 truncate max-w-[170px]" title={pub}>
                      {pub || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {msg ? (
                        <span className={`text-[10px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
                          {msg.text}
                        </span>
                      ) : canUn ? (
                        <button
                          onClick={() => setConfirmApp(app)}
                          disabled={busy}
                          className="px-2 py-0.5 text-[11px] rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        >
                          {busy ? t('remoteActions.uninstalling') : t('remoteActions.uninstall')}
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-300 italic">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services Tab — list, stop, start, restart Windows services
// ---------------------------------------------------------------------------

const STATUS_STYLE = {
  Running:     { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  Stopped:     { pill: "bg-rose-100    text-rose-700",    dot: "bg-rose-500"    },
  StartPending:{ pill: "bg-amber-100   text-amber-700",   dot: "bg-amber-400"   },
  StopPending: { pill: "bg-amber-100   text-amber-700",   dot: "bg-amber-400"   },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? { pill: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function ServicesTab({ service, baseOverride }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});
  const [actionMsg, setActionMsg] = useState({});
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await callEndpoint(
      service,
      { method: "GET", path: "/services", label: "services" },
      { baseOverride },
    );
    setLoading(false);
    if (r.ok && Array.isArray(r.data)) {
      setServices(r.data.sort((a, b) =>
        String(a.DisplayName ?? a.Name ?? "").localeCompare(String(b.DisplayName ?? b.Name ?? ""))
      ));
    } else {
      setError(r.data?.message || r.error || `Failed to load services (HTTP ${r.status})`);
    }
  }, [service, baseOverride]);

  useEffect(() => { load(); }, [load]);

  const act = async (svcName, action) => {
    setBusy((p) => ({ ...p, [svcName]: action }));
    setActionMsg((p) => ({ ...p, [svcName]: null }));
    const pathMap = { stop: "/service/stop", start: "/service/start", restart: "/service/restart" };
    const r = await callEndpoint(
      service,
      { method: "POST", path: pathMap[action], label: `${action}service` },
      { params: { Name: svcName }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[svcName]; return n; });
    setActionMsg((p) => ({ ...p, [svcName]: { ok: r.ok, text: r.ok ? `${action} OK` : (r.data || r.error || "Error") } }));
    if (r.ok) {
      setTimeout(load, 1500);
    }
  };

  const filtered = services.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return String(s.Name ?? "").toLowerCase().includes(q) ||
           String(s.DisplayName ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Filter services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-rmx-primary"
        />
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? <Spinner size="xs" /> : "↻"}
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>
      )}

      {!loading && !error && services.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">No services found.</p>
      )}

      {filtered.length > 0 && (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2">Display Name</th>
                <th className="text-left px-3 py-2 w-36">Service Name</th>
                <th className="text-left px-3 py-2 w-28">Status</th>
                <th className="px-3 py-2 w-48 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                      <Spinner size="lg" />
                      <span className="text-xs">Loading services…</span>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.map((svc) => {
                const name   = svc.Name        ?? svc.name        ?? "";
                const display= svc.DisplayName ?? svc.displayName ?? name;
                const status = svc.Status      ?? svc.status      ?? "Unknown";
                const isBusy = !!busy[name];
                const msg    = actionMsg[name];
                const running = status === "Running";
                const stopped = status === "Stopped";

                return (
                  <tr key={name} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{display}</td>
                    <td className="px-3 py-2 font-mono text-gray-500 truncate max-w-[130px]" title={name}>{name}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {msg && (
                          <span className={`text-[10px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
                            {msg.text}
                          </span>
                        )}
                        <button
                          onClick={() => act(name, "start")}
                          disabled={isBusy || running}
                          title="Start"
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy[name] === "start" ? <Spinner size="xs" className="text-emerald-700" /> : null}
                          {busy[name] === "start" ? "Starting…" : "Start"}
                        </button>
                        <button
                          onClick={() => act(name, "stop")}
                          disabled={isBusy || stopped}
                          title="Stop"
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy[name] === "stop" ? <Spinner size="xs" className="text-rose-700" /> : null}
                          {busy[name] === "stop" ? "Stopping…" : "Stop"}
                        </button>
                        <button
                          onClick={() => act(name, "restart")}
                          disabled={isBusy || stopped}
                          title="Restart"
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rmx-primary text-rmx-primary hover:bg-rmx-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy[name] === "restart" ? <Spinner size="xs" /> : null}
                          {busy[name] === "restart" ? "Restarting…" : "Restart"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && services.length > 0 && (
        <p className="text-xs text-gray-400 text-center py-2">No services match your filter.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Environment Variables Tab — view/create/edit/delete Process, User and
// Machine-scoped environment variables.
// ---------------------------------------------------------------------------

function EnvVarsTab({ service, baseOverride }) {
  const SCOPES = ["User", "Machine"];
  const [scope, setScope] = useState("User");
  const [vars, setVars] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState({});
  const [actionMsg, setActionMsg] = useState({});
  const [editingName, setEditingName] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");

  const load = useCallback(async (s) => {
    setLoading(true);
    setError(null);
    const r = await callEndpoint(
      service,
      { method: "GET", path: "/envvars", label: "list-envvars" },
      { params: { Scope: s }, baseOverride },
    );
    setLoading(false);
    if (r.ok && r.data && typeof r.data === "object") {
      setVars(r.data);
    } else {
      setError(r.data?.message || r.data || r.error || `Failed to load environment variables (HTTP ${r.status})`);
      setVars({});
    }
  }, [service, baseOverride]);

  useEffect(() => { load(scope); }, [scope, load]);

  const startEdit = (name, value) => {
    setEditingName(name);
    setEditValue(value ?? "");
    setActionMsg((p) => ({ ...p, [name]: null }));
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditValue("");
  };

  const saveEdit = async (name) => {
    setBusy((p) => ({ ...p, [name]: "save" }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/envvars", label: "set-envvar" },
      { params: { Name: name, Value: editValue, Scope: scope }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[name]; return n; });
    setActionMsg((p) => ({ ...p, [name]: { ok: r.ok, text: r.ok ? "Saved" : (r.data || r.error || "Error") } }));
    if (r.ok) {
      setEditingName(null);
      load(scope);
    }
  };

  const remove = async (name) => {
    if (!confirm(`Delete ${scope} variable "${name}"?`)) return;
    setBusy((p) => ({ ...p, [name]: "delete" }));
    const r = await callEndpoint(
      service,
      { method: "DELETE", path: "/envvars", label: "delete-envvar" },
      { params: { Name: name, Scope: scope }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[name]; return n; });
    if (r.ok) {
      load(scope);
    } else {
      setActionMsg((p) => ({ ...p, [name]: { ok: false, text: r.data || r.error || "Error" } }));
    }
  };

  const addNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy((p) => ({ ...p, __new: "save" }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/envvars", label: "set-envvar" },
      { params: { Name: name, Value: newValue, Scope: scope }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n.__new; return n; });
    if (r.ok) {
      setAdding(false);
      setNewName("");
      setNewValue("");
      load(scope);
    } else {
      setActionMsg((p) => ({ ...p, __new: { ok: false, text: r.data || r.error || "Error" } }));
    }
  };

  const entries = Object.entries(vars).sort(([a], [b]) => a.localeCompare(b));
  const filtered = entries.filter(([name, value]) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || String(value ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded border border-gray-300 overflow-hidden">
          {SCOPES.map((s) => (
            <button
              key={s}
              onClick={() => { setScope(s); setAdding(false); setEditingName(null); }}
              className={`px-3 py-1 text-xs ${scope === s ? "bg-rmx-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Filter variables…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-rmx-primary"
        />
        <button
          onClick={() => load(scope)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? <Spinner size="xs" /> : "↻"}
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          onClick={() => { setAdding(true); setEditingName(null); setNewName(""); setNewValue(""); }}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-rmx-primary text-white hover:bg-rmx-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New Variable
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>
      )}

      {adding && (
        <div className="rounded border border-gray-200 bg-gray-50 p-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="NAME"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-[140px] border border-gray-300 rounded px-2 py-1 text-xs font-mono"
          />
          <input
            type="text"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-[2] min-w-[180px] border border-gray-300 rounded px-2 py-1 text-xs font-mono"
          />
          <button
            onClick={addNew}
            disabled={!newName.trim() || busy.__new === "save"}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy.__new === "save" ? <Spinner size="xs" className="text-white" /> : null}
            Save
          </button>
          <button
            onClick={() => setAdding(false)}
            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          {actionMsg.__new && (
            <span className={`text-[10px] ${actionMsg.__new.ok ? "text-emerald-600" : "text-rose-600"}`}>{actionMsg.__new.text}</span>
          )}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">No {scope.toLowerCase()} environment variables found.</p>
      )}

      {(loading || filtered.length > 0) && (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 w-56">Name</th>
                <th className="text-left px-3 py-2">Value</th>
                <th className="px-3 py-2 w-40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                      <Spinner size="lg" />
                      <span className="text-xs">Loading {scope.toLowerCase()} environment variables…</span>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.map(([name, value]) => {
                const isEditing = editingName === name;
                const isBusy = !!busy[name];
                const msg = actionMsg[name];
                return (
                  <tr key={name} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 font-mono text-gray-800 break-all">{name}</td>
                    <td className="px-3 py-2 font-mono text-gray-600 break-all">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      ) : (
                        <span className="whitespace-pre-wrap">{value}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {msg && (
                            <span className={`text-[10px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>
                          )}
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEdit(name)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                              >
                                {busy[name] === "save" ? <Spinner size="xs" className="text-emerald-700" /> : null}
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={isBusy}
                                className="px-2 py-0.5 text-[11px] rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(name, value)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rmx-primary text-rmx-primary hover:bg-rmx-primary/10 disabled:opacity-40"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => remove(name)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                              >
                                {busy[name] === "delete" ? <Spinner size="xs" className="text-rose-700" /> : null}
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && entries.length > 0 && (
        <p className="text-xs text-gray-400 text-center py-2">No variables match your filter.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registry Tab — browse, create, edit, and delete registry keys and values.
// ---------------------------------------------------------------------------

function RegistryTab({ service, baseOverride }) {
  const HIVES = ["HKEY_LOCAL_MACHINE", "HKEY_CURRENT_USER", "HKEY_CLASSES_ROOT", "HKEY_USERS", "HKEY_CURRENT_CONFIG"];
  const HIVE_ABBR = { HKEY_LOCAL_MACHINE: "HKLM", HKEY_CURRENT_USER: "HKCU", HKEY_CLASSES_ROOT: "HKCR", HKEY_USERS: "HKU", HKEY_CURRENT_CONFIG: "HKCC" };
  const VALUE_TYPES = ["REG_SZ", "REG_DWORD", "REG_QWORD", "REG_BINARY", "REG_MULTI_SZ", "REG_EXPAND_SZ"];

  const [keyPath, setKeyPath] = useState("HKEY_LOCAL_MACHINE");
  const [addressInput, setAddressInput] = useState("HKEY_LOCAL_MACHINE");
  const [subKeys, setSubKeys] = useState([]);
  const [values, setValues] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [loadingValues, setLoadingValues] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});
  const [actionMsg, setActionMsg] = useState({});
  const [addingKey, setAddingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [addingValue, setAddingValue] = useState(false);
  const [newValueName, setNewValueName] = useState("");
  const [newValueType, setNewValueType] = useState("REG_SZ");
  const [newValueData, setNewValueData] = useState("");
  const [editingValue, setEditingValue] = useState(null);
  const [editValueData, setEditValueData] = useState("");

  const load = useCallback(async (path) => {
    setError(null);
    const sep = path.indexOf("\\");
    const hive = sep === -1 ? path : path.slice(0, sep);
    const subPath = sep === -1 ? "" : path.slice(sep + 1);

    setLoadingKeys(true);
    const keysR = await callEndpoint(
      service,
      { method: "GET", path: "/registry/keys", label: "registry-keys" },
      { params: { hive, path: subPath }, baseOverride },
    );
    setLoadingKeys(false);
    if (keysR.ok && Array.isArray(keysR.data)) {
      setSubKeys(keysR.data);
    } else {
      setSubKeys([]);
      if (!keysR.ok) setError(keysR.data || keysR.error || `Keys request failed (HTTP ${keysR.status})`);
    }

    setLoadingValues(true);
    const valsR = await callEndpoint(
      service,
      { method: "GET", path: "/registry/values", label: "registry-values" },
      { params: { keyPath: path }, baseOverride },
    );
    setLoadingValues(false);
    if (valsR.ok && Array.isArray(valsR.data)) {
      setValues(valsR.data);
    } else {
      setValues([]);
    }
  }, [service, baseOverride]);

  useEffect(() => { load(keyPath); }, [keyPath, load]);

  const navigate = (path) => {
    const norm = path.replace(/\//g, "\\").trim();
    setKeyPath(norm);
    setAddressInput(norm);
    setAddingKey(false);
    setAddingValue(false);
    setEditingValue(null);
    setActionMsg({});
  };

  const goUp = () => {
    const idx = keyPath.lastIndexOf("\\");
    if (idx > 0) navigate(keyPath.slice(0, idx));
  };

  const goToAddress = (e) => {
    e.preventDefault();
    navigate(addressInput.trim());
  };

  const createKey = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    setBusy((p) => ({ ...p, __newKey: true }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/registry/keys", label: "registry-create-key" },
      { params: { keyPath: keyPath + "\\" + name }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n.__newKey; return n; });
    if (r.ok) { setAddingKey(false); setNewKeyName(""); load(keyPath); }
    else setActionMsg((p) => ({ ...p, __newKey: { ok: false, text: r.data || r.error || "Error" } }));
  };

  const deleteKey = async (keyName, fullPath) => {
    if (!confirm(`Delete registry key "${keyName}" and all its contents?`)) return;
    setBusy((p) => ({ ...p, [keyName]: "delete" }));
    const r = await callEndpoint(
      service,
      { method: "DELETE", path: "/registry/keys", label: "registry-delete-key" },
      { params: { keyPath: fullPath }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[keyName]; return n; });
    if (r.ok) load(keyPath);
    else setActionMsg((p) => ({ ...p, [keyName]: { ok: false, text: r.data || r.error || "Error" } }));
  };

  const createValue = async () => {
    const isDefault = newValueName.trim() === "";
    setBusy((p) => ({ ...p, __newVal: true }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/registry/values", label: "registry-set-value" },
      { params: { keyPath, valueName: isDefault ? "" : newValueName, valueType: newValueType, value: newValueData, defaultValue: isDefault }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n.__newVal; return n; });
    if (r.ok) { setAddingValue(false); setNewValueName(""); setNewValueType("REG_SZ"); setNewValueData(""); load(keyPath); }
    else setActionMsg((p) => ({ ...p, __newVal: { ok: false, text: r.data || r.error || "Error" } }));
  };

  const saveValue = async (valueName, type) => {
    const isDefault = !valueName || valueName === "(Default)";
    setBusy((p) => ({ ...p, [valueName ?? ""]: "save" }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/registry/values", label: "registry-set-value" },
      { params: { keyPath, valueName: isDefault ? "" : valueName, valueType: type, value: editValueData, defaultValue: isDefault }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[valueName]; return n; });
    setActionMsg((p) => ({ ...p, [valueName]: { ok: r.ok, text: r.ok ? "Saved" : (r.data || r.error || "Error") } }));
    if (r.ok) { setEditingValue(null); load(keyPath); }
  };

  const deleteValue = async (valueName) => {
    const isDefault = !valueName || valueName === "(Default)";
    if (!confirm(`Delete registry value "${valueName || "(Default)"}"?`)) return;
    setBusy((p) => ({ ...p, [valueName ?? ""]: "delete" }));
    const r = await callEndpoint(
      service,
      { method: "DELETE", path: "/registry/values", label: "registry-delete-value" },
      { params: { keyPath, valueName: isDefault ? "" : valueName, defaultValue: isDefault }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[valueName]; return n; });
    if (r.ok) load(keyPath);
    else setActionMsg((p) => ({ ...p, [valueName]: { ok: false, text: r.data || r.error || "Error" } }));
  };

  const parts = keyPath.split("\\");
  const isAtHive = parts.length === 1;

  return (
    <div className="space-y-3">
      {/* Address bar */}
      <form onSubmit={goToAddress} className="flex items-center gap-2">
        <div className="inline-flex rounded border border-gray-300 overflow-hidden flex-shrink-0">
          {HIVES.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => navigate(h)}
              title={h}
              className={`px-2 py-1 text-[11px] ${keyPath.startsWith(h) ? "bg-rmx-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {HIVE_ABBR[h]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-rmx-primary"
          spellCheck={false}
        />
        <button type="submit" className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 whitespace-nowrap">Go</button>
        <button
          type="button"
          onClick={() => load(keyPath)}
          disabled={loadingKeys || loadingValues}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
        >
          {loadingKeys || loadingValues ? <Spinner size="xs" /> : "↻"}
          {loadingKeys || loadingValues ? "Loading…" : "Refresh"}
        </button>
      </form>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-0.5 text-xs text-gray-500 font-mono">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-0.5">
            {i > 0 && <span className="text-gray-300 mx-0.5">›</span>}
            <button
              type="button"
              onClick={() => navigate(parts.slice(0, i + 1).join("\\"))}
              className={`hover:text-rmx-primary hover:underline ${i === parts.length - 1 ? "font-semibold text-gray-700" : ""}`}
            >
              {p}
            </button>
          </span>
        ))}
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}

      {/* Sub-keys */}
      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">
            Sub-keys{subKeys.length > 0 && <span className="ml-1.5 text-gray-400 font-normal">({subKeys.length})</span>}
          </span>
          <button onClick={() => { setAddingKey(true); setNewKeyName(""); }} className="text-xs text-rmx-primary hover:text-rmx-accent">+ New Key</button>
        </div>

        {addingKey && (
          <div className="px-3 py-2 border-b border-gray-100 bg-blue-50/40 flex items-center gap-2">
            <input
              type="text"
              placeholder="Key name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              autoFocus
              className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
            />
            <button
              onClick={createKey}
              disabled={!newKeyName.trim() || !!busy.__newKey}
              className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy.__newKey ? <Spinner size="xs" className="text-white" /> : null} Create
            </button>
            <button onClick={() => setAddingKey(false)} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
            {actionMsg.__newKey && <span className={`text-[10px] ${actionMsg.__newKey.ok ? "text-emerald-600" : "text-rose-600"}`}>{actionMsg.__newKey.text}</span>}
          </div>
        )}

        {!isAtHive && (
          <button
            type="button"
            onClick={goUp}
            className="w-full px-3 py-2 border-b border-gray-100 hover:bg-gray-50 text-xs text-gray-500 flex items-center gap-2 font-mono"
          >
            <span>↑</span><span>..</span>
          </button>
        )}

        {loadingKeys ? (
          <div className="flex items-center justify-center py-6 text-gray-400"><Spinner size="md" /></div>
        ) : subKeys.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No sub-keys</p>
        ) : (
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {subKeys.map((k) => (
              <div key={k.name} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 group">
                <button
                  type="button"
                  onClick={() => navigate(k.path)}
                  className="text-xs font-mono text-rmx-primary hover:underline flex-1 text-left truncate mr-2"
                  title={k.path}
                >
                  📁 {k.name}
                </button>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100">
                  {actionMsg[k.name] && <span className={`text-[10px] ${actionMsg[k.name].ok ? "text-emerald-600" : "text-rose-600"}`}>{actionMsg[k.name].text}</span>}
                  <button
                    onClick={() => deleteKey(k.name, k.path)}
                    disabled={!!busy[k.name]}
                    className="px-2 py-0.5 text-[11px] rounded border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    {busy[k.name] === "delete" ? <Spinner size="xs" /> : null} Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Values */}
      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Values</span>
          <button onClick={() => { setAddingValue(true); setNewValueName(""); setNewValueType("REG_SZ"); setNewValueData(""); }} className="text-xs text-rmx-primary hover:text-rmx-accent">+ New Value</button>
        </div>

        {addingValue && (
          <div className="px-3 py-2 border-b border-gray-100 bg-blue-50/40 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Name (blank = default)"
              value={newValueName}
              onChange={(e) => setNewValueName(e.target.value)}
              className="flex-1 min-w-[120px] border border-gray-300 rounded px-2 py-1 text-xs font-mono"
            />
            <select
              value={newValueType}
              onChange={(e) => setNewValueType(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
            >
              {VALUE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input
              type="text"
              placeholder="Data"
              value={newValueData}
              onChange={(e) => setNewValueData(e.target.value)}
              className="flex-[2] min-w-[140px] border border-gray-300 rounded px-2 py-1 text-xs font-mono"
            />
            <button
              onClick={createValue}
              disabled={!!busy.__newVal}
              className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy.__newVal ? <Spinner size="xs" className="text-white" /> : null} Add
            </button>
            <button onClick={() => setAddingValue(false)} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
            {actionMsg.__newVal && <span className={`text-[10px] ${actionMsg.__newVal.ok ? "text-emerald-600" : "text-rose-600"}`}>{actionMsg.__newVal.text}</span>}
          </div>
        )}

        {loadingValues ? (
          <div className="flex items-center justify-center py-6 text-gray-400"><Spinner size="md" /></div>
        ) : values.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No values in this key</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 w-40">Name</th>
                  <th className="text-left px-3 py-2 w-28">Type</th>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="px-3 py-2 w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {values.map((v) => {
                  const isEditing = editingValue === v.name;
                  const isBusy = !!busy[v.name];
                  const msg = actionMsg[v.name];
                  return (
                    <tr key={v.name ?? "__default"} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-3 py-2 font-mono text-gray-700 break-all">{v.name || <em className="text-gray-400 not-italic">(Default)</em>}</td>
                      <td className="px-3 py-2 font-mono text-gray-500 text-[11px]">{v.type}</td>
                      <td className="px-3 py-2 font-mono text-gray-600 break-all">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValueData}
                            onChange={(e) => setEditValueData(e.target.value)}
                            autoFocus
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                          />
                        ) : (
                          <span>{v.data}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {msg && <span className={`text-[10px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveValue(v.name, v.type)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                              >
                                {busy[v.name] === "save" ? <Spinner size="xs" className="text-emerald-700" /> : null} Save
                              </button>
                              <button
                                onClick={() => setEditingValue(null)}
                                disabled={isBusy}
                                className="px-2 py-0.5 text-[11px] rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setEditingValue(v.name); setEditValueData(v.data || ""); setActionMsg((p) => ({ ...p, [v.name]: null })); }}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rmx-primary text-rmx-primary hover:bg-rmx-primary/10 disabled:opacity-40"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteValue(v.name)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                              >
                                {busy[v.name] === "delete" ? <Spinner size="xs" className="text-rose-700" /> : null} Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registry Cleaner Tab — scan for and fix common Windows registry issues
// ---------------------------------------------------------------------------

function RegistryCleanerTab({ service, baseOverride }) {
  const ALL_CATS = [
    "Application Paths", "Browser Helper", "Firewall Rules", "Fonts",
    "Help Files", "Installers", "Interface", "Invalid File Extensions",
    "Missing Shared DLLs", "MUI Cache", "Obsolete Software",
    "Open with Application", "Run At Startup", "Sound Events", "Windows Services",
  ];

  const [selCats, setSelCats] = useState(new Set(ALL_CATS));
  const [issues, setIssues] = useState([]);
  const [selIssues, setSelIssues] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [fixMsg, setFixMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [scanPhase, setScanPhase] = useState("");
  const wsRef = useRef(null);
  const timerRef = useRef(null);

  const issueKey = (issue) =>
    `${issue.category}|${issue.keyPath}|${issue.valueName}`;

  const toggleCat = (cat) =>
    setSelCats((prev) => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });

  const stopScan = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const scan = async () => {
    stopScan();
    setScanning(true);
    setScanMsg("");
    setScanPhase("");
    setIssues([]);
    setSelIssues(new Set());
    setHasScanned(false);
    setFixMsg("");
    setElapsed(0);

    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    const startR = await callEndpoint(
      service,
      { method: "POST", path: "/regcleaner/scan/async", label: "regcleaner-scan" },
      { params: { categories: [...selCats].join(",") }, baseOverride },
    );

    if (!startR.ok) {
      stopScan();
      setScanning(false);
      setHasScanned(true);
      setScanMsg("Scan failed: " + (startR.data?.error || startR.error || "Unknown error"));
      return;
    }

    const jobId = startR.data?.jobId;
    if (!jobId) {
      stopScan();
      setScanning(false);
      setScanMsg("Scan failed: no job ID returned");
      return;
    }

    // Derive WebSocket URL directly from the backend origin (bypasses Next.js proxy)
    const wsOrigin = new URL(baseOverride).origin.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsOrigin}/regcleaner/ws/${jobId}`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }

      if (msg.type === "progress") {
        setScanPhase(`${msg.category} (${msg.current}/${msg.total})`);
      } else if (msg.type === "complete" || msg.type === "error") {
        stopScan();
        setScanning(false);
        setHasScanned(true);
        if (msg.type === "error") {
          setScanPhase("");
          setScanMsg("Scan failed: " + (msg.message || "Unknown error"));
          return;
        }
        // Fetch full issue list from REST status endpoint
        callEndpoint(
          service,
          { method: "GET", path: `/regcleaner/scan/status/${jobId}`, label: "regcleaner-scan-status" },
          { baseOverride },
        ).then((statusR) => {
          setScanPhase("");
          if (statusR.ok && statusR.data?.issues) {
            const found = Array.isArray(statusR.data.issues) ? statusR.data.issues : [];
            setIssues(found);
            setSelIssues(new Set(found.map(issueKey)));
            setScanMsg(found.length === 0 ? "No issues found." : `Found ${found.length} issue${found.length !== 1 ? "s" : ""}.`);
          } else {
            setScanMsg("Scan complete but could not load results.");
          }
        });
      }
    };

    ws.onerror = () => {
      stopScan();
      setScanning(false);
      setHasScanned(true);
      setScanPhase("");
      setScanMsg("Scan failed: WebSocket connection error.");
    };

    ws.onclose = (evt) => {
      // Unexpected close (not triggered by us): treat as error if still scanning
      if (wsRef.current === ws) {
        wsRef.current = null;
        stopScan();
        setScanning(false);
        setHasScanned(true);
        setScanPhase("");
        setScanMsg("Scan failed: connection closed unexpectedly.");
      }
    };
  };

  const toggleIssue = (key) =>
    setSelIssues((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const getSelected = () => issues.filter((i) => selIssues.has(issueKey(i)));

  const fix = async (withBackup) => {
    const toFix = getSelected();
    if (toFix.length === 0) return;
    setFixing(true);
    setFixMsg("");

    if (withBackup) {
      const uniqueKeys = [...new Set(toFix.map((i) => i.keyPath))];
      const br = await callEndpoint(
        service,
        { method: "POST", path: "/regcleaner/backup", label: "regcleaner-backup" },
        { body: uniqueKeys, baseOverride },
      );
      if (br.ok && br.blob) {
        const url = URL.createObjectURL(br.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = br.filename || `registry_backup_${Date.now()}.reg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }

    const fr = await callEndpoint(
      service,
      { method: "POST", path: "/regcleaner/fix", label: "regcleaner-fix" },
      { body: toFix, baseOverride },
    );
    setFixing(false);
    if (fr.ok) {
      const count = toFix.length;
      const fixedKeys = new Set(toFix.map(issueKey));
      setIssues((prev) => prev.filter((i) => !fixedKeys.has(issueKey(i))));
      setSelIssues(new Set());
      setFixMsg(`Fixed ${count} issue${count !== 1 ? "s" : ""}.`);
    } else {
      setFixMsg(
        "Fix failed: " +
          (fr.data?.error || fr.error || String(fr.data) || "Unknown error"),
      );
    }
  };

  const grouped = issues.reduce((acc, iss) => {
    if (!acc[iss.category]) acc[iss.category] = [];
    acc[iss.category].push(iss);
    return acc;
  }, {});

  const selectedCount = selIssues.size;
  const scanFailed = scanMsg.startsWith("Scan failed");

  return (
    <div className="space-y-3">
      {/* Category checkboxes */}
      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">
            Categories to Scan
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => setSelCats(new Set(ALL_CATS))}
              className="text-xs text-rmx-primary hover:underline"
            >
              All
            </button>
            <button
              onClick={() => setSelCats(new Set())}
              className="text-xs text-rmx-primary hover:underline"
            >
              None
            </button>
          </div>
        </div>
        <div className="p-3 grid grid-cols-3 gap-x-6 gap-y-1.5">
          {ALL_CATS.map((cat) => (
            <label
              key={cat}
              className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 hover:text-gray-900"
            >
              <input
                type="checkbox"
                checked={selCats.has(cat)}
                onChange={() => toggleCat(cat)}
                className="rounded border-gray-300 text-rmx-primary focus:ring-rmx-primary w-3.5 h-3.5"
              />
              {cat}
            </label>
          ))}
        </div>
      </div>

      {/* Scan button */}
      <div className="flex items-center gap-3">
        <button
          onClick={scan}
          disabled={scanning || selCats.size === 0}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-sm rounded bg-rmx-primary text-white hover:bg-rmx-accent disabled:opacity-50"
        >
          {scanning && <Spinner size="xs" className="text-white" />}
          {scanning ? "Scanning…" : "Scan Registry"}
        </button>
        {!scanning && scanMsg && (
          <span
            className={`text-xs ${
              scanFailed
                ? "text-rose-500"
                : issues.length > 0
                  ? "text-amber-600 font-medium"
                  : "text-emerald-600"
            }`}
          >
            {scanMsg}
          </span>
        )}
      </div>

      {/* Live scan progress */}
      {scanning && (() => {
        const phaseMatch = scanPhase.match(/^(.+) \((\d+)\/(\d+)\)$/);
        const catName   = phaseMatch ? phaseMatch[1] : null;
        const current   = phaseMatch ? Number(phaseMatch[2]) : 0;
        const total     = phaseMatch ? Number(phaseMatch[3]) : selCats.size;
        const pct       = total > 0 ? Math.round((current / total) * 100) : 0;
        const CAT_DESC  = {
          "Application Paths":       "Checking App Paths entries for missing executables",
          "Browser Helper":          "Checking IE Browser Helper Object DLLs",
          "Firewall Rules":          "Checking Windows Firewall rule application paths",
          "Fonts":                   "Checking font registry entries for missing font files",
          "Help Files":              "Checking help file registry references",
          "Installers":              "Checking installer uninstall entries for missing paths",
          "Interface":               "Scanning COM interface proxy stubs — large hive, may take a few minutes",
          "Invalid File Extensions": "Checking file extension ProgID associations",
          "Missing Shared DLLs":     "Checking shared DLL reference counts for missing files",
          "MUI Cache":               "Checking MUI cache entries for missing applications",
          "Obsolete Software":       "Checking uninstall entries for missing uninstallers",
          "Open with Application":   "Checking Open-With application list for missing executables",
          "Run At Startup":          "Checking startup entries for missing executables",
          "Sound Events":            "Checking sound event entries for missing audio files",
          "Windows Services":        "Checking Windows Service image paths for missing binaries",
        };
        const desc = catName ? CAT_DESC[catName] : null;
        return (
          <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-blue-800">
                {catName
                  ? <>{catName} <span className="font-normal text-blue-600">({current} of {total})</span></>
                  : "Initialising scan…"}
              </span>
              <span className="tabular-nums text-blue-600">{elapsed}s elapsed</span>
            </div>
            {total > 0 && (
              <div className="w-full h-1.5 rounded-full bg-blue-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {desc && (
              <p className="text-xs text-blue-700">{desc}</p>
            )}
          </div>
        );
      })()}

      {/* Clean result */}
      {hasScanned && issues.length === 0 && !scanning && !scanFailed && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          No issues found in the selected categories.
        </div>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setSelIssues(new Set(issues.map(issueKey)))}
                className="text-rmx-primary hover:underline"
              >
                Select All
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setSelIssues(new Set())}
                className="text-rmx-primary hover:underline"
              >
                None
              </button>
              <span className="text-gray-400">
                {selectedCount} of {issues.length} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              {fixMsg && (
                <span
                  className={`text-xs ${fixMsg.startsWith("Fix failed") ? "text-rose-500" : "text-emerald-600"}`}
                >
                  {fixMsg}
                </span>
              )}
              <button
                onClick={() => fix(true)}
                disabled={fixing || selectedCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded border border-amber-400 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {fixing && <Spinner size="xs" className="text-amber-700" />}
                {fixing ? "Working…" : "Backup & Fix"}
              </button>
              <button
                onClick={() => fix(false)}
                disabled={fixing || selectedCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {fixing ? "Working…" : "Fix Selected"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {Object.entries(grouped).map(([cat, catIssues]) => (
              <div
                key={cat}
                className="border border-gray-200 rounded overflow-hidden"
              >
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700">{cat}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">
                    {catIssues.length}
                  </span>
                  <button
                    onClick={() =>
                      setSelIssues((prev) => {
                        const n = new Set(prev);
                        catIssues.forEach((i) => n.add(issueKey(i)));
                        return n;
                      })
                    }
                    className="ml-auto text-[11px] text-rmx-primary hover:underline"
                  >
                    Select all
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50/50">
                      <tr className="text-[10px] text-gray-400 uppercase tracking-wide">
                        <th className="w-8 px-2 py-1" />
                        <th className="text-left px-3 py-1">Name</th>
                        <th className="text-left px-3 py-1">Value / Path</th>
                        <th className="text-left px-3 py-1">Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catIssues.map((issue) => {
                        const key = issueKey(issue);
                        return (
                          <tr
                            key={key}
                            className="border-t border-gray-100 hover:bg-gray-50 align-top"
                          >
                            <td className="px-2 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={selIssues.has(key)}
                                onChange={() => toggleIssue(key)}
                                className="rounded border-gray-300 text-rmx-primary w-3.5 h-3.5"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-gray-700 break-all max-w-[200px]">
                              {issue.name}
                            </td>
                            <td
                              className="px-3 py-1.5 font-mono text-gray-400 max-w-[280px] truncate"
                              title={issue.value}
                            >
                              {issue.value}
                            </td>
                            <td className="px-3 py-1.5 text-rose-500 whitespace-nowrap">
                              {issue.issue}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Startup Applications Tab — view/add/remove/enable/disable Windows startup apps
// Uses HKCU/HKLM\...\CurrentVersion\Run and StartupApproved\Run registry keys.
// ---------------------------------------------------------------------------

function StartupAppsTab({ service, baseOverride }) {
  const SCOPES = ["All", "User", "Machine"];
  const [scope, setScope] = useState("All");
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState({});
  const [actionMsg, setActionMsg] = useState({});
  const [editingName, setEditingName] = useState(null);
  const [editCommand, setEditCommand] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newScope, setNewScope] = useState("User");

  const load = useCallback(async (s) => {
    setLoading(true);
    setError(null);
    const r = await callEndpoint(
      service,
      { method: "GET", path: "/startupapps", label: "list-startupapps" },
      { params: { Scope: s }, baseOverride },
    );
    setLoading(false);
    if (r.ok && Array.isArray(r.data)) {
      setApps(r.data);
    } else {
      setError(r.data?.message || r.data || r.error || `Failed to load startup applications (HTTP ${r.status})`);
      setApps([]);
    }
  }, [service, baseOverride]);

  useEffect(() => { load(scope); }, [scope, load]);

  const startEdit = (app) => {
    setEditingName(app.name);
    setEditCommand(app.command ?? "");
    setActionMsg((p) => ({ ...p, [app.name]: null }));
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditCommand("");
  };

  const appScope = (app) => app.scope || (scope === "All" ? "User" : scope);

  const saveEdit = async (app) => {
    setBusy((p) => ({ ...p, [app.name]: "save" }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/startupapps", label: "add-startupapp" },
      { params: { Name: app.name, Command: editCommand, Scope: appScope(app) }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[app.name]; return n; });
    setActionMsg((p) => ({ ...p, [app.name]: { ok: r.ok, text: r.ok ? "Saved" : (r.data || r.error || "Error") } }));
    if (r.ok) {
      setEditingName(null);
      load(scope);
    }
  };

  const remove = async (app) => {
    if (!confirm(`Remove startup entry "${app.name}"?`)) return;
    setBusy((p) => ({ ...p, [app.name]: "delete" }));
    const r = await callEndpoint(
      service,
      { method: "DELETE", path: "/startupapps", label: "delete-startupapp" },
      { params: { Name: app.name, Scope: appScope(app) }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[app.name]; return n; });
    if (r.ok) {
      load(scope);
    } else {
      setActionMsg((p) => ({ ...p, [app.name]: { ok: false, text: r.data || r.error || "Error" } }));
    }
  };

  const toggle = async (app) => {
    setBusy((p) => ({ ...p, [app.name]: "toggle" }));
    const r = await callEndpoint(
      service,
      { method: "PUT", path: "/startupapps", label: "toggle-startupapp" },
      { params: { Name: app.name, Enabled: String(!app.enabled), Scope: appScope(app) }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n[app.name]; return n; });
    if (r.ok) {
      load(scope);
    } else {
      setActionMsg((p) => ({ ...p, [app.name]: { ok: false, text: r.data || r.error || "Error" } }));
    }
  };

  const addNew = async () => {
    const name = newName.trim();
    const command = newCommand.trim();
    if (!name || !command) return;
    const targetScope = scope === "All" ? newScope : scope;
    setBusy((p) => ({ ...p, __new: "save" }));
    const r = await callEndpoint(
      service,
      { method: "POST", path: "/startupapps", label: "add-startupapp" },
      { params: { Name: name, Command: command, Scope: targetScope }, baseOverride },
    );
    setBusy((p) => { const n = { ...p }; delete n.__new; return n; });
    if (r.ok) {
      setAdding(false);
      setNewName("");
      setNewCommand("");
      load(scope);
    } else {
      setActionMsg((p) => ({ ...p, __new: { ok: false, text: r.data || r.error || "Error" } }));
    }
  };

  const filtered = apps.filter((app) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return app.name.toLowerCase().includes(q) || String(app.command ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded border border-gray-300 overflow-hidden">
          {SCOPES.map((s) => (
            <button
              key={s}
              onClick={() => { setScope(s); setAdding(false); setEditingName(null); }}
              className={`px-3 py-1 text-xs ${scope === s ? "bg-rmx-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Filter startup apps…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-rmx-primary"
        />
        <button
          onClick={() => load(scope)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? <Spinner size="xs" /> : "↻"}
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          onClick={() => { setAdding(true); setEditingName(null); setNewName(""); setNewCommand(""); }}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-rmx-primary text-white hover:bg-rmx-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Entry
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>
      )}

      {adding && (
        <div className="rounded border border-gray-200 bg-gray-50 p-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Entry name (e.g. MyApp)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-[140px] border border-gray-300 rounded px-2 py-1 text-xs font-mono"
          />
          <input
            type="text"
            placeholder={`"C:\\Path\\to\\app.exe"`}
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            className="flex-[2] min-w-[220px] border border-gray-300 rounded px-2 py-1 text-xs font-mono"
          />
          {scope === "All" && (
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
            >
              <option value="User">User</option>
              <option value="Machine">Machine</option>
            </select>
          )}
          <button
            onClick={addNew}
            disabled={!newName.trim() || !newCommand.trim() || busy.__new === "save"}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy.__new === "save" ? <Spinner size="xs" className="text-white" /> : null}
            Add
          </button>
          <button
            onClick={() => setAdding(false)}
            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          {actionMsg.__new && (
            <span className={`text-[10px] ${actionMsg.__new.ok ? "text-emerald-600" : "text-rose-600"}`}>{actionMsg.__new.text}</span>
          )}
        </div>
      )}

      {!loading && !error && apps.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">No {scope === "All" ? "" : scope.toLowerCase() + " "}startup applications found.</p>
      )}

      {(loading || filtered.length > 0) && (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 w-40">Name</th>
                <th className="text-left px-3 py-2">Command</th>
                {scope === "All" && <th className="px-3 py-2 w-20 text-center">Scope</th>}
                <th className="px-3 py-2 w-20 text-center">Status</th>
                <th className="px-3 py-2 w-52 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={scope === "All" ? 5 : 4} className="py-10 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                      <Spinner size="lg" />
                      <span className="text-xs">Loading {scope.toLowerCase()} startup applications…</span>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.map((app) => {
                const isEditing = editingName === app.name;
                const isBusy = !!busy[app.name];
                const msg = actionMsg[app.name];
                return (
                  <tr key={`${appScope(app)}-${app.name}`} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 font-mono text-gray-800 break-all">{app.name}</td>
                    <td className="px-3 py-2 font-mono text-gray-600 break-all">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editCommand}
                          onChange={(e) => setEditCommand(e.target.value)}
                          autoFocus
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      ) : (
                        <span className="whitespace-pre-wrap">{app.command}</span>
                      )}
                    </td>
                    {scope === "All" && (
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          appScope(app) === "Machine" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {appScope(app)}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        app.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {app.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {msg && (
                          <span className={`text-[10px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>
                        )}
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(app)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                            >
                              {busy[app.name] === "save" ? <Spinner size="xs" className="text-emerald-700" /> : null}
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={isBusy}
                              className="px-2 py-0.5 text-[11px] rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(app)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rmx-primary text-rmx-primary hover:bg-rmx-primary/10 disabled:opacity-40"
                            >
                              Edit

                            </button>
                            <button
                              onClick={() => toggle(app)}
                              disabled={isBusy}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border disabled:opacity-40 ${
                                app.enabled
                                  ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {busy[app.name] === "toggle" ? <Spinner size="xs" /> : null}
                              {app.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              onClick={() => remove(app)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                            >
                              {busy[app.name] === "delete" ? <Spinner size="xs" className="text-rose-700" /> : null}
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && apps.length > 0 && (
        <p className="text-xs text-gray-400 text-center py-2">No startup apps match your filter.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheduled Tasks Tab — list/create/modify/delete Windows scheduled tasks
// Responsive aligned layout for Triggers, Conditions, Settings tabs
// ---------------------------------------------------------------------------

function ScheduledTasksTab({ service, baseOverride }) {
  const { t } = useTranslation();
  const [folders, setFolders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("\\");
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState("general");

  // Browse modal state for selecting remote files/folders
  const [browseVisible, setBrowseVisible] = useState(false);
  const [browseMode, setBrowseMode] = useState("file");
  const [browsePath, setBrowsePath] = useState("\\");
  const [browseEntries, setBrowseEntries] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseTargetIdx, setBrowseTargetIdx] = useState(null);

  const loadBrowse = async (dir) => {
    setBrowseLoading(true);
    try {
      const r = await callEndpoint(service, { method: "GET", path: "/listdirectory", label: "listdirectory" }, { params: { Folder: dir }, baseOverride });
      if (r.ok && Array.isArray(r.data)) {
        setBrowseEntries(r.data);
        setBrowsePath(dir);
      } else {
        setBrowseEntries([]);
      }
    } catch (err) { setBrowseEntries([]); }
    setBrowseLoading(false);
  };

  const openBrowse = (mode, initial = "\\", targetIdx = null) => {
    setBrowseMode(mode);
    setBrowseTargetIdx(targetIdx);
    setBrowseVisible(true);
    const start = initial || "\\";
    setBrowsePath(start);
    loadBrowse(start);
  };

  const closeBrowse = () => { setBrowseVisible(false); setBrowseEntries([]); setBrowseTargetIdx(null); };

  const selectBrowseEntry = (entry) => {
    if (!entry) return;
    if (browseMode === 'file' && !entry.isDirectory) {
      setForm((f) => ({
        ...f,
        Actions: f.Actions.map((a, i) => i === browseTargetIdx ? { ...a, Command: entry.path } : a),
      }));
      closeBrowse();
    } else if (browseMode === 'folder' && entry.isDirectory) {
      setForm((f) => ({
        ...f,
        Actions: f.Actions.map((a, i) => i === browseTargetIdx ? { ...a, WorkingDirectory: entry.path } : a),
      }));
      closeBrowse();
    } else if (entry.isDirectory) {
      loadBrowse(entry.path);
    }
  };

  const selectCurrentFolderAsWorkingDir = () => {
    const dir = browsePath || "\\";
    setForm((f) => ({
      ...f,
      Actions: f.Actions.map((a, i) => i === browseTargetIdx ? { ...a, WorkingDirectory: dir } : a),
    }));
    closeBrowse();
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const f = await callEndpoint(service, { method: "GET", path: "/listtaskfolders", label: "list-task-folders" }, { baseOverride });
      if (f.ok && Array.isArray(f.data)) setFolders(f.data);
      const t = await callEndpoint(service, { method: "GET", path: "/listtasks", label: "list-tasks" }, { baseOverride });
      if (t.ok && Array.isArray(t.data)) {
        const seen = new Set();
        const deduped = [];
        for (const it of t.data) {
          const id = String(it.TaskPath ?? it.TaskName ?? it["TaskName"] ?? it["Task"] ?? "").trim();
          if (!id) continue;
          if (!seen.has(id)) { seen.add(id); deduped.push(it); }
        }
        setTasks(deduped);
      }
    } catch (err) {
      setMessage({ ok: false, text: String(err) });
    } finally {
      setLoading(false);
    }
  }, [service, baseOverride]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const getTaskFullPath = (t) => {
    if (t.Folder != null && (t.TaskName != null || t.Name != null)) {
      const f = String(t.Folder).replace(/[\\/]+$/g, "") || "\\";
      const n = String(t.TaskName ?? t.Name ?? "").replace(/^[\\/]+/, "");
      return (f === "\\" ? "\\" : f + "\\") + n;
    }
    return String(t.TaskPath ?? t.TaskName ?? t["TaskName"] ?? t["Task"] ?? "").trim();
  };

  const getTaskFolder = (t) => {
    const full = getTaskFullPath(t).replace(/\//g, "\\");
    const idx = full.lastIndexOf("\\");
    if (idx < 0) return "\\";
    if (idx === 0) return "\\";
    return full.slice(0, idx);
  };

  const tasksInFolder = useMemo(() => {
    if (!tasks) return [];
    const selected = selectedFolder || "\\";
    
    let folderPrefix = selected.replace(/[\\/]+$/g, "");
    if (!folderPrefix.startsWith("\\")) folderPrefix = "\\" + folderPrefix;
    if (folderPrefix === "") folderPrefix = "\\";

    if (folderPrefix === "\\") return tasks;

    const fpNorm = folderPrefix.toLowerCase();
    
    return tasks.filter((t) => {
      const taskFolder = getTaskFolder(t).toLowerCase();
      return taskFolder === fpNorm || getTaskFullPath(t).toLowerCase().startsWith(fpNorm + "\\");
    });
  }, [tasks, selectedFolder]);

  const parseTaskDisplayName = (full) => {
    if (!full) return "";
    const parts = full.split("\\");
    return parts[parts.length - 1];
  };

  const [form, setForm] = useState({
    TaskName: "",
    Folder: "\\",
    Description: "",
    Actions: [ { Command: "", Arguments: "", WorkingDirectory: "" } ],
    Triggers: [ { Type: "ONCE", StartDate: "", StartTime: "09:00", RepeatEveryMinutes: null, DaysOfWeek: [] } ],
    Conditions: {
      RunOnlyIfIdle: false,
      StopIfIdle: false,
      IdleMinutes: 10,
      RunOnlyIfNetworkAvailable: false,
    },
    Settings: {
      RunWhenUserLoggedOn: false,
      RunWithHighestPrivileges: false,
      DeleteIfMissed: false,
    },
    RunAsUser: "SYSTEM",
    RunAsPassword: "",
  });

  const validateForm = () => {
    if (!form.TaskName || String(form.TaskName).trim() === "") return "Task Name is required";
    if (!form.Folder) return "Folder is required";
    if (!form.Actions || form.Actions.length === 0) return "At least one action is required";
    if (form.Actions.some(a => !a.Command || a.Command.trim() === "")) return "Each action must have a command";
    if (!form.Triggers || form.Triggers.length === 0) return "At least one trigger is required";
    for (const tr of form.Triggers) {
      if (!tr.Type) return "Trigger type required";
      if (!tr.StartTime) return "Trigger start time required";
    }
    return null;
  };

  const onCreate = async () => {
    const v = validateForm();
    if (v) { setMessage({ ok: false, text: v }); return; }
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "POST", path: "/createtask", label: "create-task" }, { body: form, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Task created" : (r.data || r.error || "Create failed") });
      if (r.ok) {
        setForm({ ...form, TaskName: "", Actions: [ { Command: "", Arguments: "", WorkingDirectory: "" } ], Triggers: [ { Type: "ONCE", StartDate: "", StartTime: "09:00", RepeatEveryMinutes: null, DaysOfWeek: [] } ] });
      }
      await loadAll();
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const onModify = async () => {
    if (!selectedTaskId) return;
    const v = validateForm();
    if (v) { setMessage({ ok: false, text: v }); return; }
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "PUT", path: "/modifytask", label: "modify-task" }, { body: form, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Task modified" : (r.data || r.error || "Modify failed") });
      await loadAll();
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const onDelete = async (taskIdOrFullName) => {
    const taskFullName = String(taskIdOrFullName || "");
    if (!taskFullName) return;
    if (!confirm(`Delete task ${taskFullName}?`)) return;
    setBusy(true); setMessage(null);
    try {
      const taskName = parseTaskDisplayName(taskFullName);
      const folder = taskFullName.substring(0, Math.max(0, taskFullName.lastIndexOf("\\")));
      const r = await callEndpoint(service, { method: "DELETE", path: "/deletetask", label: "delete-task" }, { params: { TaskName: taskName, Folder: folder }, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Task deleted" : (r.data || r.error || "Delete failed") });
      await loadAll();
      setSelectedTask(null);
      setSelectedTaskId(null);
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const isTaskEnabled = (t) => {
    if (!t) return true;
    const state = t["Scheduled Task State"] ?? t["ScheduledTaskState"];
    if (state != null) return String(state).trim().toLowerCase() !== "disabled";
    const status = t.Status ?? t["Status"];
    return String(status || "").trim().toLowerCase() !== "disabled";
  };

  const onEnable = async (task) => {
    if (!task) return;
    const full = task.TaskName || task["TaskName"] || "";
    const name = parseTaskDisplayName(full);
    const folder = full.substring(0, Math.max(0, full.lastIndexOf("\\"))) || "\\";
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "PUT", path: "/enabletask", label: "enable-task" }, { params: { TaskName: name, Folder: folder }, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Task enabled" : (r.data || r.error || "Enable failed") });
      await loadAll();
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const onDisable = async (task) => {
    if (!task) return;
    const full = task.TaskName || task["TaskName"] || "";
    const name = parseTaskDisplayName(full);
    const folder = full.substring(0, Math.max(0, full.lastIndexOf("\\"))) || "\\";
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "PUT", path: "/disabletask", label: "disable-task" }, { params: { TaskName: name, Folder: folder }, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Task disabled" : (r.data || r.error || "Disable failed") });
      await loadAll();
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const onExport = async (task) => {
    if (!task) return;
    const full = task.TaskName || task["TaskName"] || "";
    const id = String(task.TaskPath || full || "").trim();
    if (!id) return;
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "GET", path: "/exporttask", label: "export-task" }, { params: { TaskPath: id }, baseOverride });
      if (r.ok) {
        const xml = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
        const blob = new Blob([xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${parseTaskDisplayName(full) || "task"}.xml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setMessage({ ok: true, text: "Task exported" });
      } else {
        setMessage({ ok: false, text: r.data || r.error || "Export failed" });
      }
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const onSelectTask = async (task) => {
    setSelectedTask(task);
    const full = task.TaskName || task["TaskName"] || "";
    const id = String(task.TaskPath || full || "").trim();
    setSelectedTaskId(id);
    const name = parseTaskDisplayName(full);
    const folder = full.substring(0, Math.max(0, full.lastIndexOf("\\")));
    const parsedActions = [];
    if (task.Actions) {
      parsedActions.push({ Command: String(task.Actions).split(' ')[0] || task.Actions, Arguments: String(task.Actions).split(' ').slice(1).join(' ') || '' , WorkingDirectory: '' });
    }

    setForm({
      TaskName: name,
      Folder: folder || "\\",
      Description: task.Description ?? "",
      Actions: parsedActions.length ? parsedActions : [ { Command: "", Arguments: "", WorkingDirectory: "" } ],
      Triggers: [ { Type: "ONCE", StartDate: "", StartTime: "09:00", RepeatEveryMinutes: null, DaysOfWeek: [] } ],
      Conditions: { RunOnlyIfIdle: false, StopIfIdle: false, IdleMinutes: 10, RunOnlyIfNetworkAvailable: false },
      Settings: { RunWhenUserLoggedOn: false, RunWithHighestPrivileges: false, DeleteIfMissed: false },
      RunAsUser: task.RunAsUser ?? "SYSTEM",
      RunAsPassword: "",
    });

    try {
      const r = await callEndpoint(service, { method: "GET", path: "/gettask", label: "get-task" }, { params: { TaskPath: id }, baseOverride });
      if (r.ok && r.data) {
        const d = r.data;
        setForm((f) => ({
          ...f,
          Description: d.Description ?? f.Description,
          RunAsUser: d.RunAsUser ?? f.RunAsUser,
          Actions: Array.isArray(d.Actions) && d.Actions.length ? d.Actions.map(a => ({ Command: a.Command || "", Arguments: a.Arguments || "", WorkingDirectory: a.WorkingDirectory || "" })) : f.Actions,
          Triggers: Array.isArray(d.Triggers) && d.Triggers.length ? d.Triggers.map((tr) => {
            const sb = tr.StartBoundary || "";
            let date = "";
            let time = "09:00";
            if (sb && sb.includes('T')) { const parts = sb.split('T'); date = parts[0]; time = (parts[1]||'').slice(0,5) || time; }
            return { Type: tr.Type || 'ONCE', StartDate: date, StartTime: time, RepeatEveryMinutes: null, DaysOfWeek: [] };
          }) : f.Triggers,
          Conditions: { ...f.Conditions, ...(d.Conditions || {}) },
          Settings: { ...f.Settings, ...(d.Settings || {}) },
        }));
      }
    } catch (err) { console.error('gettask failed', err); }
  };

  const onCreateFolder = async () => {
    const name = prompt("New folder name (e.g. \\MyFolder):");
    if (!name) return;
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "POST", path: "/createtaskfolder", label: "create-task-folder" }, { params: { Folder: name }, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Folder created" : (r.data || r.error || "Create folder failed") });
      await loadAll();
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const onRenameFolder = async () => {
    const oldName = selectedFolder;
    if (!oldName) { setMessage({ ok: false, text: "Select a folder to rename" }); return; }
    const newName = prompt("New folder name (prefix with \\):", oldName);
    if (!newName) return;
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "PUT", path: "/renametaskfolder", label: "rename-task-folder" }, { params: { Folder: oldName, NewFolder: newName }, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Folder renamed" : (r.data || r.error || "Rename failed") });
      await loadAll();
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const onDeleteFolder = async () => {
    const f = selectedFolder;
    if (!f || f === "\\") { setMessage({ ok: false, text: "Select a non-root folder to delete" }); return; }
    if (!confirm(`Delete folder ${f}? This will not delete tasks inside.`)) return;
    setBusy(true); setMessage(null);
    try {
      const r = await callEndpoint(service, { method: "DELETE", path: "/deletetaskfolder", label: "delete-task-folder" }, { params: { Folder: f }, baseOverride });
      setMessage({ ok: r.ok, text: r.ok ? "Folder deleted" : (r.data || r.error || "Delete failed") });
      await loadAll();
      setSelectedFolder("\\");
    } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); }
  };

  const updateAction = (idx, patch) => setForm((f) => ({ ...f, Actions: f.Actions.map((a,i)=> i===idx ? { ...a, ...patch } : a) }));
  const addAction = () => setForm((f) => ({ ...f, Actions: [...f.Actions, { Command: "", Arguments: "", WorkingDirectory: "" }] }));
  const removeAction = (idx) => setForm((f) => ({ ...f, Actions: f.Actions.filter((_,i)=>i!==idx) }));

  const updateTrigger = (idx, patch) => setForm((f) => ({ ...f, Triggers: f.Triggers.map((a,i)=> i===idx ? { ...a, ...patch } : a) }));
  const addTrigger = () => setForm((f) => ({ ...f, Triggers: [...f.Triggers, { Type: "ONCE", StartDate: "", StartTime: "09:00", RepeatEveryMinutes: null, DaysOfWeek: [] }] }));
  const removeTrigger = (idx) => setForm((f) => ({ ...f, Triggers: f.Triggers.filter((_,i)=>i!==idx) }));

  function FolderTree({ folders, selected, onSelect }) {
    const [menu, setMenu] = useState(null);

    const buildTree = (folders) => {
      const root = {};
      folders.forEach((f) => {
        if (!f) return;
        const parts = f.replace(/^\\+/, '').split('\\').filter(Boolean);
        let cur = root;
        parts.forEach((p) => { cur[p] = cur[p] || {}; cur = cur[p]; });
      });
      return root;
    };

    const tree = useMemo(() => buildTree(folders || []), [folders]);

    const renderNode = (node, path = "\\") => {
      return Object.keys(node).sort().map((key) => {
        const childPath = (path === "\\") ? (`\\${key}`) : (`${path}\\${key}`);
        const isSelected = selected === childPath;

        return (
          <li key={childPath} className="list-none">
            <div
              className={`px-2 py-1 cursor-pointer rounded transition-colors ${
                isSelected ? 'bg-rmx-primary/10 font-medium text-rmx-primary' : 'hover:bg-gray-50'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(childPath);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, folder: childPath });
              }}
            >
              {key}
            </div>
            {Object.keys(node[key]).length > 0 ? (
              <ul className="pl-3 border-l border-gray-100 ml-2 my-0.5 space-y-0.5">
                {renderNode(node[key], childPath)}
              </ul>
            ) : null}
          </li>
        );
      });
    };

    const hideMenu = () => setMenu(null);

    const createUnder = async (parent) => {
      const name = prompt('New folder name (no leading \\):');
      if (!name) { hideMenu(); return; }
      const full = parent === '\\' ? `\\${name}` : `${parent}\\${name}`;
      setBusy(true); setMessage(null);
      try {
        const r = await callEndpoint(service, { method: 'POST', path: '/createtaskfolder', label: 'create-task-folder' }, { params: { Folder: full }, baseOverride });
        setMessage({ ok: r.ok, text: r.ok ? 'Folder created' : (r.data || r.error || 'Create folder failed') });
        await loadAll();
      } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); hideMenu(); }
    };

    const rename = async (oldName) => {
      const newName = prompt('New folder name (prefix with \\):', oldName);
      if (!newName) { hideMenu(); return; }
      setBusy(true); setMessage(null);
      try {
        const r = await callEndpoint(service, { method: 'PUT', path: '/renametaskfolder', label: 'rename-task-folder' }, { params: { Folder: oldName, NewFolder: newName }, baseOverride });
        setMessage({ ok: r.ok, text: r.ok ? 'Folder renamed' : (r.data || r.error || 'Rename failed') });
        await loadAll();
      } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); hideMenu(); }
    };

    const delet = async (folder) => {
      if (!confirm(`Delete folder ${folder}? This will not delete tasks inside.`)) { hideMenu(); return; }
      setBusy(true); setMessage(null);
      try {
        const r = await callEndpoint(service, { method: 'DELETE', path: '/deletetaskfolder', label: 'delete-task-folder' }, { params: { Folder: folder }, baseOverride });
        setMessage({ ok: r.ok, text: r.ok ? 'Folder deleted' : (r.data || r.error || 'Delete failed') });
        await loadAll();
        setSelectedFolder('\\');
      } catch (err) { setMessage({ ok: false, text: String(err) }); } finally { setBusy(false); hideMenu(); }
    };

    return (
      <div className="relative">
        <div className="rounded border p-2 max-h-[40rem] overflow-auto">
          {folders == null || loading ? (
            <div className="flex items-center gap-2 text-gray-400 py-3">
              <Spinner size="xs" />
              <span className="text-xs">Loading…</span>
            </div>
          ) : (
            <ul className="text-xs space-y-0.5">
              <li
                key="all"
                className={`px-2 py-1 cursor-pointer rounded ${
                  selected === "\\" ? 'bg-rmx-primary/10 font-medium text-rmx-primary' : 'hover:bg-gray-50'
                }`}
                onClick={() => onSelect("\\")}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, folder: "\\" }); }}
              >
                \\ (All)
              </li>
              {renderNode(tree)}
            </ul>
          )}
        </div>
        {menu ? (
          <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 60 }} onMouseLeave={hideMenu} className="bg-white border rounded shadow text-xs">
            <div className="p-1">
              <button className="block w-full text-left px-2 py-1 hover:bg-gray-100" onClick={() => createUnder(menu.folder)}>New folder here</button>
              <button className="block w-full text-left px-2 py-1 hover:bg-gray-100" onClick={() => rename(menu.folder)}>Rename</button>
              {menu.folder !== "\\" ? <button className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-rose-600" onClick={() => delet(menu.folder)}>Delete</button> : null}
              <button className="block w-full text-left px-2 py-1 hover:bg-gray-100" onClick={hideMenu}>Cancel</button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message ? (
        <div className={`p-2 rounded text-xs ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message.text}</div>
      ) : null}

      {/* Windows Task Scheduler-style layout: library tree | task list + properties | actions pane */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_190px] gap-3 items-start">

        {/* Left: Task Scheduler Library tree */}
        <div className="col-span-1">
          <h3 className="text-sm font-semibold mb-2">Task Scheduler Library</h3>
          <FolderTree folders={folders} selected={selectedFolder} onSelect={(f)=> { setSelectedFolder(f); setSelectedTask(null); setSelectedTaskId(null); }} />
        </div>

        {/* Middle: task list on top, selected-task properties below (mirrors the MMC task list + preview pane) */}
        <div className="col-span-1 space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-2">
              {selectedFolder === "\\" ? (
                <>Showing <span className="font-medium text-gray-700">all</span> tasks ({tasksInFolder.length})</>
              ) : (
                <>Folder: <span className="font-mono font-medium text-gray-700">{selectedFolder}</span> ({tasksInFolder.length} task{tasksInFolder.length === 1 ? "" : "s"})</>
              )}
            </p>
            <div className="rounded border overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0"><tr><th className="text-left px-2 py-1">Name</th><th className="text-left px-2 py-1">Status</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={2} className="py-8 text-center">
                        <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                          <Spinner size="lg" />
                          <span className="text-xs">Loading scheduled tasks…</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {tasksInFolder.map((t, i) => {
                        const full = t.TaskName || t["TaskName"] || "";
                        const enabled = isTaskEnabled(t);
                        return (
                          <tr key={i} className={`cursor-pointer border-t border-gray-100 ${(selectedTaskId && selectedTaskId === (t.TaskPath || full)) ? 'bg-rmx-primary/10' : 'hover:bg-gray-50'}`}
                            onClick={() => onSelectTask(t)}>
                            <td className="px-2 py-1 font-mono">{parseTaskDisplayName(full)}</td>
                            <td className="px-2 py-1">
                              <span className={`inline-flex items-center gap-1 ${enabled ? 'text-emerald-700' : 'text-gray-400'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                {enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {tasksInFolder.length === 0 && (
                        <tr><td colSpan={2} className="text-xs text-gray-400 py-3">
                          {selectedFolder === "\\" ? "No tasks" : "No tasks directly in this folder"}
                        </td></tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">{selectedTaskId ? `Properties: ${parseTaskDisplayName(selectedTaskId)}` : "Create New Task"}</h3>

            <div className="rounded border p-3">
              {/* Tab headers */}
              <div className="flex gap-1 mb-3">
                {['general','triggers','actions','conditions','settings'].map((k) => (
                  <button key={k} onClick={() => setActiveTab(k)} className={`px-2 py-1 text-xs border-b-2 ${activeTab===k ? 'border-rmx-primary text-rmx-primary' : 'border-transparent text-gray-600 hover:text-rmx-primary'}`}>{k[0].toUpperCase()+k.slice(1)}</button>
                ))}
              </div>

              {activeTab === 'general' && (
                <div className="space-y-2">
                  <label className="block text-xs">
                    <span className="block text-gray-600 mb-1">Folder</span>
                    <input value={form.Folder} onChange={(e) => setForm({ ...form, Folder: e.target.value })} className="w-full rounded border px-2 py-1 text-xs font-mono" />
                  </label>
                  <label className="block text-xs">
                    <span className="block text-gray-600 mb-1">Task Name</span>
                    <input value={form.TaskName} onChange={(e) => setForm({ ...form, TaskName: e.target.value })} className="w-full rounded border px-2 py-1 text-xs font-mono" />
                  </label>
                  <label className="block text-xs">
                    <span className="block text-gray-600 mb-1">Description</span>
                    <input value={form.Description} onChange={(e) => setForm({ ...form, Description: e.target.value })} className="w-full rounded border px-2 py-1 text-xs" />
                  </label>
                  <label className="block text-xs">
                    <span className="block text-gray-600 mb-1">Run as User</span>
                    <input value={form.RunAsUser} onChange={(e) => setForm({ ...form, RunAsUser: e.target.value })} className="w-full rounded border px-2 py-1 text-xs font-mono" />
                  </label>
                  <label className="block text-xs">
                    <span className="block text-gray-600 mb-1">Run as Password</span>
                    <input type="password" value={form.RunAsPassword} onChange={(e) => setForm({ ...form, RunAsPassword: e.target.value })} className="w-full rounded border px-2 py-1 text-xs" />
                  </label>
                </div>
              )}

              {activeTab === 'triggers' && (
                <div className="space-y-3">
                  {form.Triggers.map((tr, idx) => (
                    <div key={idx} className="border border-gray-200 rounded p-3 bg-gray-50/50 space-y-2">
                      {/* Row 1: Type, Date, Time */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Type</label>
                          <select
                            value={tr.Type}
                            onChange={(e) => updateTrigger(idx, { Type: e.target.value })}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                          >
                            <option value="ONCE">Once</option>
                            <option value="DAILY">Daily</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="MONTHLY">Monthly</option>
                            <option value="INTERVAL">Repeat (advanced)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Start Date</label>
                          <input
                            type="date"
                            value={tr.StartDate}
                            onChange={(e) => updateTrigger(idx, { StartDate: e.target.value })}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Start Time</label>
                          <input
                            type="time"
                            value={tr.StartTime}
                            onChange={(e) => updateTrigger(idx, { StartTime: e.target.value })}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                          />
                        </div>
                      </div>

                      {/* Row 2: Repeat settings & Remove */}
                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-xs">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!tr.RepeatEveryMinutes}
                              onChange={(e) => updateTrigger(idx, { RepeatEveryMinutes: e.target.checked ? (tr.RepeatEveryMinutes || 5) : null })}
                              className="rounded border-gray-300 accent-rmx-primary"
                            />
                            <span className="text-gray-700">Repeat every</span>
                          </label>
                          {tr.RepeatEveryMinutes ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                value={tr.RepeatEveryMinutes}
                                onChange={(e) => updateTrigger(idx, { RepeatEveryMinutes: Number(e.target.value) || 1 })}
                                className="text-xs border border-gray-300 rounded px-2 py-0.5 w-16 bg-white font-mono"
                              />
                              <span className="text-gray-500 text-[11px]">mins</span>
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeTrigger(idx)}
                          className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-0.5 rounded hover:bg-rose-50 border border-transparent hover:border-rose-200"
                        >
                          Remove Trigger
                        </button>
                      </div>

                      {/* Conditional sub-fields */}
                      {tr.Type === 'WEEKLY' && (
                        <div className="pt-2 border-t border-gray-100 text-xs">
                          <span className="block text-[11px] text-gray-500 mb-1">Days of week:</span>
                          <div className="flex flex-wrap gap-2">
                            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
                              <label className="inline-flex items-center gap-1 cursor-pointer" key={d}>
                                <input
                                  type="checkbox"
                                  checked={tr.DaysOfWeek.includes(d)}
                                  onChange={(e) => {
                                    const days = new Set(tr.DaysOfWeek);
                                    if (e.target.checked) days.add(d); else days.delete(d);
                                    updateTrigger(idx, { DaysOfWeek: Array.from(days) });
                                  }}
                                  className="accent-rmx-primary"
                                />
                                <span>{d}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {tr.Type === 'MONTHLY' && (
                        <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                          <label className="block">
                            <span className="block text-[11px] text-gray-500 mb-0.5">Day of month</span>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={tr.DayOfMonth || ''}
                              onChange={(e) => updateTrigger(idx, { DayOfMonth: Number(e.target.value) || null })}
                              className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                            />
                          </label>
                          <label className="block">
                            <span className="block text-[11px] text-gray-500 mb-0.5">Every N months</span>
                            <input
                              type="number"
                              min={1}
                              value={tr.EveryNMonths || 1}
                              onChange={(e) => updateTrigger(idx, { EveryNMonths: Number(e.target.value) || 1 })}
                              className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addTrigger}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                  >
                    + Add Trigger
                  </button>
                </div>
              )}

              {activeTab === 'actions' && (
                <div className="space-y-2">
                  {form.Actions.map((a, idx) => (
                    <div key={idx} className="border border-gray-200 rounded p-2 bg-gray-50/50">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <label className="block">
                          <span className="block text-[11px] text-gray-500 mb-0.5">Command</span>
                          <div className="flex gap-1">
                            <input value={a.Command} onChange={(e) => updateAction(idx, { Command: e.target.value })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white font-mono" />
                            <button type="button" onClick={() => openBrowse('file', a.Command || '\\', idx)} className="text-xs px-2 py-1 border rounded whitespace-nowrap">Browse…</button>
                          </div>
                        </label>
                        <label className="block">
                          <span className="block text-[11px] text-gray-500 mb-0.5">Arguments</span>
                          <input value={a.Arguments} onChange={(e) => updateAction(idx, { Arguments: e.target.value })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white font-mono" />
                        </label>
                        <label className="block">
                          <span className="block text-[11px] text-gray-500 mb-0.5">Start in (Working Directory)</span>
                          <div className="flex gap-1">
                            <input value={a.WorkingDirectory} onChange={(e) => updateAction(idx, { WorkingDirectory: e.target.value })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white font-mono" />
                            <button type="button" onClick={() => openBrowse('folder', a.WorkingDirectory || '\\', idx)} className="text-xs px-2 py-1 border rounded whitespace-nowrap">Browse…</button>
                          </div>
                        </label>
                      </div>
                      {form.Actions.length > 1 ? (
                        <div className="flex justify-end mt-1">
                          <button type="button" onClick={() => removeAction(idx)} className="text-xs text-rose-600 hover:text-rose-700">Remove Action</button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={addAction} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700">+ Add Action</button>
                </div>
              )}

              {activeTab === 'conditions' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-2 border border-gray-200 rounded p-3 bg-gray-50/50">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.Conditions.RunOnlyIfIdle}
                        onChange={(e) => setForm({ ...form, Conditions: { ...form.Conditions, RunOnlyIfIdle: e.target.checked } })}
                        className="rounded border-gray-300 accent-rmx-primary"
                      />
                      <span>Run only if computer is idle</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.Conditions.StopIfIdle}
                        onChange={(e) => setForm({ ...form, Conditions: { ...form.Conditions, StopIfIdle: e.target.checked } })}
                        className="rounded border-gray-300 accent-rmx-primary"
                      />
                      <span>Stop task if computer ceases to be idle</span>
                    </label>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-gray-600">Idle duration:</span>
                      <input
                        type="number"
                        min={1}
                        value={form.Conditions.IdleMinutes}
                        onChange={(e) => setForm({ ...form, Conditions: { ...form.Conditions, IdleMinutes: Number(e.target.value) || 1 } })}
                        className="w-20 text-xs border border-gray-300 rounded px-2 py-1 bg-white font-mono"
                      />
                      <span className="text-gray-500">minutes</span>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded p-3 bg-gray-50/50">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.Conditions.RunOnlyIfNetworkAvailable}
                        onChange={(e) => setForm({ ...form, Conditions: { ...form.Conditions, RunOnlyIfNetworkAvailable: e.target.checked } })}
                        className="rounded border-gray-300 accent-rmx-primary"
                      />
                      <span>Run only if network connection is available</span>
                    </label>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="border border-gray-200 rounded p-3 bg-gray-50/50 space-y-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.Settings.RunWhenUserLoggedOn}
                      onChange={(e) => setForm({ ...form, Settings: { ...form.Settings, RunWhenUserLoggedOn: e.target.checked } })}
                      className="rounded border-gray-300 accent-rmx-primary"
                    />
                    <span>Run whether user is logged on or not</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.Settings.RunWithHighestPrivileges}
                      onChange={(e) => setForm({ ...form, Settings: { ...form.Settings, RunWithHighestPrivileges: e.target.checked } })}
                      className="rounded border-gray-300 accent-rmx-primary"
                    />
                    <span>Run with highest privileges (Administrator)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.Settings.DeleteIfMissed}
                      onChange={(e) => setForm({ ...form, Settings: { ...form.Settings, DeleteIfMissed: e.target.checked } })}
                      className="rounded border-gray-300 accent-rmx-primary"
                    />
                    <span>Delete task if not scheduled to run again</span>
                  </label>
                </div>
              )}

              <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
                <button onClick={onCreate} disabled={busy} className="px-3 py-1 text-xs bg-rmx-primary text-white rounded hover:bg-rmx-accent disabled:opacity-50">Create</button>
                <button onClick={onModify} disabled={busy || !selectedTaskId} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Save Changes</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions pane, mirroring the MMC-style Task Scheduler Actions panel */}
        <div className="col-span-1">
          <h3 className="text-sm font-semibold mb-2">Actions</h3>
          <div className="rounded border divide-y divide-gray-100 text-xs bg-white">
            <div className="p-2 space-y-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1 pb-1 truncate" title={selectedFolder}>
                {selectedFolder === "\\" ? "Task Scheduler Library" : selectedFolder}
              </div>
              <button onClick={onCreateFolder} className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50">New Folder…</button>
              <button onClick={onRenameFolder} className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50">Rename Folder</button>
              <button onClick={onDeleteFolder} className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-rose-600">Delete Folder</button>
              <button onClick={loadAll} disabled={loading} className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50">
                {loading ? <><Spinner size="xs" /> Loading…</> : "Refresh"}
              </button>
              <button
                onClick={() => { setSelectedTask(null); setSelectedTaskId(null); setForm({ ...form, TaskName: "", Actions: [ { Command: "", Arguments: "", WorkingDirectory: "" } ], Triggers: [ { Type: "ONCE", StartDate: "", StartTime: "09:00", RepeatEveryMinutes: null, DaysOfWeek: [] } ] }); }}
                className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50 font-medium text-rmx-primary"
              >
                Create Task…
              </button>
            </div>

            {selectedTaskId ? (
              <div className="p-2 space-y-1">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1 pb-1 truncate" title={selectedTaskId}>
                  Selected Task
                </div>
                <button
                  onClick={() => onEnable(selectedTask)}
                  disabled={busy || isTaskEnabled(selectedTask)}
                  className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Enable
                </button>
                <button
                  onClick={() => onDisable(selectedTask)}
                  disabled={busy || !isTaskEnabled(selectedTask)}
                  className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Disable
                </button>
                <button
                  onClick={() => onExport(selectedTask)}
                  disabled={busy}
                  className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Export…
                </button>
                <button
                  onClick={() => selectedTaskId && onDelete(selectedTaskId)}
                  disabled={busy}
                  className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-rose-600 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Browse modal for selecting remote files/folders */}
      {browseVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg border border-gray-200 shadow-xl p-4 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Select {browseMode === 'file' ? 'File' : 'Folder'}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => { const up = (() => {
                  const p = (browsePath || '\\').replace(/\\+$/,'');
                  if (!p || p === '\\') return '\\';
                  const parts = p.split('\\');
                  parts.pop();
                  const np = parts.join('\\') || '\\';
                  return np;
                })(); loadBrowse(up); }} className="px-2 py-1 text-xs border rounded">Up</button>
                <button onClick={closeBrowse} className="px-2 py-1 text-xs border rounded">Close</button>
              </div>
            </div>
            <div className="mb-2 text-xs">Current: <span className="font-mono">{browsePath}</span></div>
            <div className="max-h-64 overflow-auto border rounded p-2">
              {browseLoading ? <p className="text-xs text-gray-500">Loading…</p> : (
                <ul className="text-xs">
                  {browseEntries.map((e, i) => (
                    <li key={i} className={`flex items-center justify-between px-2 py-1 cursor-pointer hover:bg-gray-50 ${e.isDirectory ? 'font-semibold' : ''}`} onClick={() => selectBrowseEntry(e)}>
                      <span className="truncate">{e.name || e.path}</span>
                      <span className="text-gray-400 text-[11px]">{e.isDirectory ? 'DIR' : 'FILE'}</span>
                    </li>
                  ))}
                  {browseEntries.length === 0 && <li className="text-xs text-gray-400">No entries</li>}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              {browseMode === 'folder' && <button onClick={selectCurrentFolderAsWorkingDir} className="px-3 py-1 text-xs bg-rmx-primary text-white rounded">Select Folder</button>}
              <button onClick={closeBrowse} className="px-3 py-1 text-xs border rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config Management Tab — createconfig / deleteconfig via ActionCards
// ---------------------------------------------------------------------------

export default function NodeRsmsPage() {
  const { t } = useTranslation();
  const { ip } = useParams();
  const nodeIp = useMemo(() => decodeURIComponent(String(ip ?? "")), [ip]);
  const [port, setPort] = useState("9014");
  const [group, setGroup] = useState("info");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("port");
    const g = params.get("group");
    if (p) setPort(p);
    if (g && GROUPS.some((entry) => entry.key === g)) setGroup(g);
  }, []);

  const service = findService("remote-server");
  // For private IPs use http + explicit port (goes through /api/proxy).
  // For public hostnames (ngrok, cloud) use https + no port — the tunnel
  // handles the internal port mapping, and the call goes direct from the browser.
  const baseOverride = isPrivateHost(nodeIp)
    ? `http://${nodeIp}:${port}`
    : `https://${nodeIp}`;

  const grouped = useMemo(() => {
    if (!service) return {};
    const out = Object.fromEntries(GROUPS.map((g) => [g.key, []]));
    service.endpoints.forEach((e) => {
      if (CUSTOM_LABELS.has(e.label) || HIDDEN_COMMAND_LABELS.has(e.label)) return;
      const g = GROUPS.find((entry) => entry.test(e));
      if (!g) return;
      out[g.key].push(e);
    });
    return out;
  }, [service]);

  if (!service) {
    return <section><p>Remote Server service catalogue entry missing.</p></section>;
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-3">
        <div>
          <h1 className="text-2xl font-semibold text-rmx-primary">{t('remoteActions.title')} — {nodeIp}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {t('remoteActions.nodeIpPreassigned')}
          </p>
          <p className="text-xs mt-1">
            <Link href="/entities/nodes" className="text-rmx-accent hover:underline">
              {t('remoteActions.backToNodes')}
            </Link>
          </p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-gray-200">
        {GROUPS.map((g) => {
          const count = g.custom ? null : (grouped[g.key] || []).length;
          const groupLabelKey = {
            "info": "remoteActions.systemInfo",
            "installed-apps": "remoteActions.installedApps",
            "file-manager": "remoteActions.fileManager",
            "services": "remoteActions.services",
            "scheduled-tasks": "remoteActions.scheduledTasks",
            "env-vars": "remoteActions.envVariables",
            "registry": "remoteActions.registry",
            "reg-scanner": "remoteActions.regScanner",
            "startup-apps": "remoteActions.startupApps",
          }[g.key] ?? g.key;
          return (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={`px-3 py-1.5 text-sm border-b-2 transition ${
                group === g.key
                  ? "border-rmx-primary text-rmx-primary font-medium"
                  : "border-transparent text-gray-600 hover:text-rmx-primary"
              }`}
            >
              {t(groupLabelKey)}
              {count !== null ? <span className="ml-1 text-xs text-gray-400">({count})</span> : null}
            </button>
          );
        })}
      </nav>

      {group === "installed-apps" ? (
        <InstalledAppsTab service={service} baseOverride={baseOverride} />
      ) : group === "file-manager" ? (
        <FileManagerTab service={service} baseOverride={baseOverride} />
      ) : group === "services" ? (
        <ServicesTab service={service} baseOverride={baseOverride} />
      ) : group === "scheduled-tasks" ? (
        <ScheduledTasksTab service={service} baseOverride={baseOverride} />
      ) : group === "env-vars" ? (
        <EnvVarsTab service={service} baseOverride={baseOverride} />
      ) : group === "registry" ? (
        <RegistryTab service={service} baseOverride={baseOverride} />
      ) : group === "reg-scanner" ? (
        <RegistryCleanerTab service={service} baseOverride={baseOverride} />
      ) : group === "startup-apps" ? (
        <StartupAppsTab service={service} baseOverride={baseOverride} />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {(grouped[group] || []).map((endpoint) => (
              <ActionCard
                key={endpoint.path + endpoint.method}
                service={service}
                endpoint={endpoint}
                baseOverride={baseOverride}
                nodeIp={nodeIp}
              />
            ))}
          </div>
          {(grouped[group] || []).length === 0 ? (
            <p className="text-xs text-gray-400">No actions in this section.</p>
          ) : null}
        </>
      )}
    </section>
  );
}