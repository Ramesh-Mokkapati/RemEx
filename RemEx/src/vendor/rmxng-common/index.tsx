import { useEffect, useMemo, useState } from "react";
import { Store, useStore } from "@tanstack/react-store";
import { ConsoleLogger, consoleLogger } from "./core";

export { ConsoleLogger, consoleLogger };

export function loadSettingsFlexible<T>(
  userId: string,
  storagePrefix: string,
  logger = consoleLogger,
): Partial<T> | null {
  if (typeof window === "undefined") return null;

  const candidates = [
    `${storagePrefix}${userId}`,
    `${storagePrefix}${userId.toLowerCase()}`,
  ];

  for (const key of candidates) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      return JSON.parse(raw) as Partial<T>;
    } catch (error) {
      logger.warn("Failed to load settings", { key, error });
    }
  }

  return null;
}

export function persistSettings<T>(
  userId: string,
  state: T,
  storagePrefix: string,
  logger = consoleLogger,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      `${storagePrefix}${userId.toLowerCase()}`,
      JSON.stringify(state),
    );
  } catch (error) {
    logger.warn("Failed to persist settings", { userId, error });
  }
}

export type PrimaryButtonLocation = "left" | "right";

type CommonSettingsState = {
  paginationEnabled: boolean;
  primaryButtonLocation: PrimaryButtonLocation;
};

const COMMON_SETTINGS_KEY = "rmxng-common:settings";
const COMMON_DEFAULTS: CommonSettingsState = {
  paginationEnabled: true,
  primaryButtonLocation: "right",
};

function loadCommonSettings(): CommonSettingsState {
  if (typeof window === "undefined") return COMMON_DEFAULTS;

  try {
    const raw = window.localStorage.getItem(COMMON_SETTINGS_KEY);
    if (!raw) return COMMON_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<CommonSettingsState>;
    return {
      paginationEnabled:
        typeof parsed.paginationEnabled === "boolean"
          ? parsed.paginationEnabled
          : COMMON_DEFAULTS.paginationEnabled,
      primaryButtonLocation:
        parsed.primaryButtonLocation === "left" ||
        parsed.primaryButtonLocation === "right"
          ? parsed.primaryButtonLocation
          : COMMON_DEFAULTS.primaryButtonLocation,
    };
  } catch {
    return COMMON_DEFAULTS;
  }
}

function saveCommonSettings(state: CommonSettingsState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(COMMON_SETTINGS_KEY, JSON.stringify(state));
  } catch {}
}

const commonSettingsStore = new Store<CommonSettingsState>(COMMON_DEFAULTS);

let commonSettingsInitialized = false;

function ensureCommonSettingsLoaded() {
  if (commonSettingsInitialized || typeof window === "undefined") return;
  commonSettingsInitialized = true;
  commonSettingsStore.setState(() => loadCommonSettings());
}

export function useSettings() {
  ensureCommonSettingsLoaded();
  return useStore(commonSettingsStore, (state) => state);
}

export function usePrimaryButtonLocation() {
  ensureCommonSettingsLoaded();
  return useStore(commonSettingsStore, (state) => state.primaryButtonLocation);
}

export function setPaginationEnabled(value: boolean) {
  ensureCommonSettingsLoaded();
  commonSettingsStore.setState((prev) => {
    const next = { ...prev, paginationEnabled: value };
    saveCommonSettings(next);
    return next;
  });
}

export function setPrimaryButtonLocation(value: PrimaryButtonLocation) {
  ensureCommonSettingsLoaded();
  commonSettingsStore.setState((prev) => {
    const next = { ...prev, primaryButtonLocation: value };
    saveCommonSettings(next);
    return next;
  });
}

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SearchBar({
  value,
  onChange,
  placeholder = "Search",
}: SearchBarProps) {
  return (
    <input
      type="search"
      id="search-bar"
      name="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
    />
  );
}

type PaginationProps = {
  currentPage?: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  paginationEnabled?: boolean;
};

export function Pagination({
  currentPage = 1,
  totalItems,
  itemsPerPage,
  onPageChange,
  paginationEnabled = true,
}: PaginationProps) {
  if (!paginationEnabled || totalItems <= itemsPerPage) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-700">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        className="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Previous
      </button>
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages}
        className="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}

function normalizeSearchValue(value: unknown) {
  if (value == null) return "";
  return String(value).toLowerCase();
}

export function useSearchAndPagination<T extends Record<string, any>>(
  items: T[],
  searchField: keyof T | string,
  itemsPerPage: number,
) {
  const { paginationEnabled } = useSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) =>
      normalizeSearchValue(item?.[searchField as keyof T]).includes(query),
    );
  }, [items, searchField, searchQuery]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedItems = useMemo(() => {
    if (!paginationEnabled) return filteredItems;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [currentPage, filteredItems, itemsPerPage, paginationEnabled]);

  const handleSearchImmediate = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  return {
    searchQuery,
    handleSearch: handleSearchImmediate,
    handleSearchImmediate,
    paginatedItems,
    totalItems,
    currentPage,
    setCurrentPage,
    totalPages,
    paginationEnabled,
  };
}
