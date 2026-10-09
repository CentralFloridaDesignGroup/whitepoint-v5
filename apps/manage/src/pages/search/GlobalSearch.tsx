import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import type { SearchResults } from "@whitepoint/types";
import { requestJson } from "../../api/client";

const MAX_PER_GROUP = 8;
const MIN_QUERY = 2;

type Option = {
  key: string;
  group: "Projects" | "Clients";
  label: string;
  detail: string;
  path: string;
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const [request, setRequest] = useState<{ q: string; id: number } | null>(
    null,
  );
  const root = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = text.trim().slice(0, 200);

  const options = useMemo<Option[]>(
    () => [
      ...(results?.projects ?? [])
        .slice(0, MAX_PER_GROUP)
        .map((p) => ({
          key: `p-${p.id}`,
          group: "Projects" as const,
          label: `${p.project_number} · ${p.name}`,
          detail: p.client_name || "",
          path: `/project/${p.id}`,
        })),
      ...(results?.clients ?? [])
        .slice(0, MAX_PER_GROUP)
        .map((c) => ({
          key: `c-${c.id}`,
          group: "Clients" as const,
          label: `${c.client_number} · ${c.name}`,
          detail: c.email || c.phone || "",
          path: `/client/${c.id}`,
        })),
    ],
    [results],
  );
  const total =
    (results?.projects.length ?? 0) + (results?.clients.length ?? 0);
  const viewAllIndex = options.length;

  useEffect(() => {
    setOpen(false);
    setHighlight(-1);
  }, [location.key]);

  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        if (document.querySelector('dialog[open], [role="menu"]')) return;
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    setHighlight(-1);
    if (!request) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setResults(null);
    requestJson<SearchResults>(`/search?q=${encodeURIComponent(request.q)}`, {
      authMode: "session",
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setResults(data);
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  function updateText(value: string) {
    setText(value);
    setRequest(null);
    setResults(null);
    setError("");
    setLoading(false);
    setOpen(false);
  }

  function viewAll() {
    if (request) navigate(`/search?q=${encodeURIComponent(request.q)}`);
    setOpen(false);
  }

  function choose(index: number) {
    if (index >= 0 && index < options.length) navigate(options[index].path);
    else viewAll();
    setOpen(false);
    setText(""); // Clear the search input after choosing an option
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (open && highlight >= 0) choose(highlight);
    else if (query.length >= MIN_QUERY) {
      setRequest({ q: query, id: Date.now() });
      setOpen(true);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }
    const count = options.length + (total > 0 ? 1 : 0);
    if (!count) return;
    const next =
      event.key === "ArrowDown"
        ? (highlight + 1) % count
        : highlight <= 0
          ? count - 1
          : highlight - 1;
    setHighlight(next);
    document
      .getElementById(`global-search-option-${next}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  const showPanel = open && request !== null;

  return (
    <form
      ref={root}
      role="search"
      aria-label="Record search"
      onSubmit={submit}
      className="relative flex w-full max-w-xl items-center"
    >
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={input}
          role="combobox"
          aria-label="Search projects and clients"
          aria-keyshortcuts="Control+k Meta+k"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? "global-search-results" : undefined}
          aria-activedescendant={
            showPanel && highlight >= 0
              ? `global-search-option-${highlight}`
              : undefined
          }
          autoComplete="off"
          value={text}
          maxLength={200}
          onChange={(event) => updateText(event.target.value)}
          onFocus={() => {
            if (request) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search projects and clients"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-16 text-sm outline-none transition focus:border-sky-700 focus:bg-white focus:ring-2 focus:ring-sky-700/15"
        />
        {query ? (
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-sky-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Search
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 sm:block"
          >
            Ctrl K
          </kbd>
        )}
      </div>
      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-slate-900 shadow-lg">
          {loading && (
            <p role="status" className="p-3 text-sm text-slate-500">
              Searching…
            </p>
          )}
          {error && (
            <p role="alert" className="p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {!loading && !error && results && total === 0 && (
            <p role="status" className="p-3 text-sm text-slate-500">
              No matching records.
            </p>
          )}
          <div
            id="global-search-results"
            role="listbox"
            aria-label="Search results"
            aria-busy={loading}
          >
            {(["Projects", "Clients"] as const).map((group) => {
              const items = options.filter((option) => option.group === group);
              if (!items.length) return null;
              return (
                <div key={group} role="group" aria-label={group}>
                  <h2 className="px-3 py-2 text-xs font-semibold text-slate-500">
                    {group}
                  </h2>
                  {items.map((option) => {
                    const index = options.indexOf(option);
                    return (
                      <button
                        key={option.key}
                        id={`global-search-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={highlight === index}
                        tabIndex={-1}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(index)}
                        className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-sky-50 ${highlight === index ? "bg-sky-50" : ""}`}
                      >
                        <span className="block font-medium">
                          {option.label}
                        </span>
                        {option.detail && (
                          <span className="block text-xs text-slate-500">
                            {option.detail}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {total > 0 && (
              <button
                id={`global-search-option-${viewAllIndex}`}
                type="button"
                role="option"
                aria-selected={highlight === viewAllIndex}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={viewAll}
                className={`mt-1 block w-full rounded px-3 py-2 text-left text-sm font-semibold text-sky-800 hover:bg-sky-50 ${highlight === viewAllIndex ? "bg-sky-50" : ""}`}
              >
                View all results for “{request?.q}”
              </button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
