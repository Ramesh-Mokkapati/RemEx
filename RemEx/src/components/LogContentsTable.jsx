"use client";

import { useMemo, useState } from "react";

const PRIORITY_COLUMNS = [
  ["eventDate", "Date"],
  ["eventTime", "Time"],
  ["eventModule", "Module"],
  ["eventID", "Event ID"],
  ["eventType", "Type"],
  ["type", "Type"],
  ["eventLog", "Message"],
];

export function isLogContentsRows(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data.find((entry) => entry && typeof entry === "object");
  if (!first) return false;
  return ["eventDate", "eventTime", "eventModule", "eventID", "eventType", "eventLog"].some((key) =>
    Object.prototype.hasOwnProperty.call(first, key)
  );
}

function compareValues(a, b) {
  const x = String(a ?? "").toLowerCase();
  const y = String(b ?? "").toLowerCase();
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isErrorType(value) {
  return formatValue(value).trim().toUpperCase() === "E";
}

export default function LogContentsTable({ rows }) {
  const [sortBy, setSortBy] = useState("eventDate");
  const [sortDir, setSortDir] = useState("desc");

  const columns = useMemo(() => {
    const seen = new Set();
    const ordered = [];

    PRIORITY_COLUMNS.forEach(([key, label]) => {
      if (rows.some((row) => Object.prototype.hasOwnProperty.call(row ?? {}, key)) && !seen.has(key)) {
        seen.add(key);
        ordered.push({ key, label });
      }
    });

    rows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      Object.keys(row).forEach((key) => {
        if (seen.has(key)) return;
        seen.add(key);
        ordered.push({ key, label: key });
      });
    });

    return ordered;
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    const direction = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => direction * compareValues(formatValue(left?.[sortBy]), formatValue(right?.[sortBy])));
  }, [rows, sortBy, sortDir]);

  const onSort = (column) => {
    if (column === sortBy) {
      setSortDir((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDir("asc");
  };

  return (
    <div className="max-h-80 overflow-auto rounded border border-gray-200">
      <table className="min-w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-gray-100">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="border-b border-gray-200 px-2 py-1 text-left">
                <button
                  type="button"
                  onClick={() => onSort(column.key)}
                  className="inline-flex items-center gap-1 font-semibold text-gray-700 hover:text-rmx-primary"
                >
                  {column.label}
                  {sortBy === column.key ? <span>{sortDir === "asc" ? "↑" : "↓"}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr
              key={`log-row-${index}`}
              className={
                isErrorType(row?.eventType) || isErrorType(row?.type)
                  ? "bg-rose-100 hover:bg-rose-200"
                  : "odd:bg-white even:bg-gray-50"
              }
            >
              {columns.map((column) => (
                <td
                  key={`${column.key}-${index}`}
                  className={`border-b border-gray-100 px-2 py-1 font-mono ${
                    column.key === "eventLog" ? "whitespace-pre-wrap break-words" : "whitespace-nowrap"
                  }`}
                >
                  {formatValue(row?.[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
