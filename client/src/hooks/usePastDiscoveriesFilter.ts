import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "pastDiscoveriesProjectFilter";
const FULL_STORAGE_KEY = "pastDiscoveriesFilters";
const EVENT_NAME = "past-discoveries-filter-changed";

export type ProjectFilterValue = "all" | number;
export type SourceFilter = "all" | "ai" | "manual";

export interface PastDiscoveriesFilters {
  project: ProjectFilterValue;
  tags: string[];
  source: SourceFilter;
  search: string;
}

const DEFAULT_FILTERS: PastDiscoveriesFilters = {
  project: "all",
  tags: [],
  source: "all",
  search: "",
};

function getURLParams(): URLSearchParams | null {
  try {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
}

function readProjectFromStorage(): ProjectFilterValue {
  try {
    const url = getURLParams();
    if (url) {
      const fromUrl = url.get("project");
      if (fromUrl === "all") return "all";
      if (fromUrl) {
        const n = parseInt(fromUrl, 10);
        if (!Number.isNaN(n)) return n;
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw === "all") return "all";
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? "all" : n;
  } catch {
    return "all";
  }
}

function writeProjectToStorage(value: ProjectFilterValue) {
  try {
    localStorage.setItem(STORAGE_KEY, value === "all" ? "all" : String(value));
    // Sync URL with the rest of the persisted filters so external setters
    // (e.g. usePastDiscoveriesFilter consumers in other parts of the app)
    // also update the shareable URL on every change.
    if (typeof window !== "undefined") {
      let extras: Pick<PastDiscoveriesFilters, "tags" | "source" | "search"> = {
        tags: [],
        source: "all",
        search: "",
      };
      try {
        const raw = localStorage.getItem(FULL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.tags)) {
            extras.tags = parsed.tags.filter((t: unknown): t is string => typeof t === "string");
          }
          if (parsed.source === "ai" || parsed.source === "manual") extras.source = parsed.source;
          if (typeof parsed.search === "string") extras.search = parsed.search;
        }
      } catch {}
      const url = new URL(window.location.href);
      const setOrDelete = (k: string, v: string | null) => {
        if (v == null || v === "") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      };
      setOrDelete("project", value === "all" ? null : String(value));
      setOrDelete("tags", extras.tags.length > 0 ? extras.tags.join(",") : null);
      setOrDelete("source", extras.source === "all" ? null : extras.source);
      setOrDelete("q", extras.search || null);
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    }
  } catch {}
}

function readFullFromStorage(): PastDiscoveriesFilters {
  const project = readProjectFromStorage();
  const url = getURLParams();
  let tags: string[] = [];
  let source: SourceFilter = "all";
  let search = "";
  try {
    const raw = localStorage.getItem(FULL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tags)) {
        tags = parsed.tags.filter((t: unknown): t is string => typeof t === "string");
      }
      if (parsed.source === "ai" || parsed.source === "manual") source = parsed.source;
      if (typeof parsed.search === "string") search = parsed.search;
    }
  } catch {}
  if (url) {
    const urlTags = url.get("tags");
    if (urlTags !== null) {
      tags = urlTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
    const urlSource = url.get("source");
    if (urlSource === "ai" || urlSource === "manual" || urlSource === "all") {
      source = urlSource;
    }
    const urlSearch = url.get("q");
    if (urlSearch !== null) search = urlSearch;
  }
  return { project, tags, source, search };
}

function writeFullToStorage(filters: PastDiscoveriesFilters) {
  try {
    writeProjectToStorage(filters.project);
    localStorage.setItem(
      FULL_STORAGE_KEY,
      JSON.stringify({
        tags: filters.tags,
        source: filters.source,
        search: filters.search,
      }),
    );
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const setOrDelete = (k: string, v: string | null) => {
        if (v == null || v === "") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      };
      setOrDelete("project", filters.project === "all" ? null : String(filters.project));
      setOrDelete("tags", filters.tags.length > 0 ? filters.tags.join(",") : null);
      setOrDelete("source", filters.source === "all" ? null : filters.source);
      setOrDelete("q", filters.search || null);
      window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
  } catch {}
}

export function usePastDiscoveriesFilter(): [
  ProjectFilterValue,
  (next: ProjectFilterValue) => void,
] {
  const [value, setValue] = useState<ProjectFilterValue>(() => readProjectFromStorage());

  useEffect(() => {
    const onChange = () => setValue(readProjectFromStorage());
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((next: ProjectFilterValue) => {
    writeProjectToStorage(next);
    setValue(next);
    try {
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {}
  }, []);

  return [value, update];
}

export function usePastDiscoveriesFilters(): [
  PastDiscoveriesFilters,
  (next: Partial<PastDiscoveriesFilters>) => void,
  () => void,
] {
  const [filters, setFilters] = useState<PastDiscoveriesFilters>(() =>
    readFullFromStorage(),
  );

  useEffect(() => {
    const onChange = () => setFilters(readFullFromStorage());
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((patch: Partial<PastDiscoveriesFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      writeFullToStorage(next);
      try {
        window.dispatchEvent(new Event(EVENT_NAME));
      } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const cleared: PastDiscoveriesFilters = { ...DEFAULT_FILTERS, project: filters.project };
    writeFullToStorage(cleared);
    setFilters(cleared);
    try {
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {}
  }, [filters.project]);

  return [filters, update, reset];
}
