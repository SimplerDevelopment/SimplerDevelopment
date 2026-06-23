'use client';

/**
 * EntityPicker — typeahead-style chip for selecting a single
 * tenant-scoped entity (meeting, note, CRM company, CRM deal) by name.
 *
 * Replaces the raw numeric-ID inputs that lived in DecisionForm's anchors
 * section (HANDOFF §6 P2 — "Decision anchors on the create / edit form are
 * numeric ID inputs"). One picker per anchor.
 *
 * Selection model: at most ONE row is selected. The chip renders a small
 * × to clear, and clicking the chip body re-opens the dropdown so the user
 * can swap to a different row.
 *
 * Data flow:
 *   - The first time the dropdown opens, we fetch a list of up to 20 rows
 *     via `endpoint`. The endpoint is expected to honour `?limit=20` and,
 *     when supported, `?search=<query>` for server-side filtering.
 *   - If the endpoint does not support `search` (e.g. crm/deals which
 *     returns an unpaginated array and ignores limit), we fall back to a
 *     client-side `.filter()` over the initial page.
 *   - When the user types after the dropdown is open, we debounce by 150ms
 *     and re-fetch `?search=<query>` so server-side endpoints stay
 *     authoritative. Endpoints that ignore search just return the same
 *     page; the client-side filter still runs over the response.
 *
 * Display shape is delegated to `displayRow` — each picker passes a small
 * mapper that turns the raw API row into `{ id, primary, secondary }`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface EntityPickerRow {
  id: number;
  /** Primary line — entity name / title. */
  primary: string;
  /** Optional secondary line — e.g. company domain, meeting date, deal value. */
  secondary?: string | null;
}

export interface EntityPickerProps {
  /** Field label shown above the picker (e.g. "Meeting"). */
  label: string;
  /** Material Icon name shown in the label + chip. */
  icon: string;
  /** Currently selected id (parent-owned). null when no selection. */
  value: number | null;
  /** Called with the new id (or null when cleared). */
  onChange: (id: number | null) => void;
  /**
   * Endpoint that returns `{ success: true, data: { items: [...] } }`
   * OR `{ success: true, data: [...] }` (CRM-style flat array). The hook
   * normalises both shapes.
   */
  endpoint: string;
  /**
   * Map a raw API row to an `EntityPickerRow`. Each picker site provides
   * this — keeps the component agnostic of the source schema.
   */
  displayRow: (raw: unknown) => EntityPickerRow | null;
  /** Placeholder shown in the search input. */
  searchPlaceholder?: string;
  /**
   * Whether the upstream endpoint honours `?search=<q>`. When false, the
   * picker fetches once and filters client-side. Defaults to `true`.
   */
  supportsServerSearch?: boolean;
}

interface ApiResponse {
  success?: boolean;
  data?: { items?: unknown[] } | unknown[];
  message?: string;
}

/** Normalise the two response shapes we see in this codebase. */
function pickItems(json: ApiResponse): unknown[] {
  if (!json?.success || !json.data) return [];
  if (Array.isArray(json.data)) return json.data;
  const items = (json.data as { items?: unknown[] }).items;
  return Array.isArray(items) ? items : [];
}

export default function EntityPicker({
  label,
  icon,
  value,
  onChange,
  endpoint,
  displayRow,
  searchPlaceholder,
  supportsServerSearch = true,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<EntityPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Selected row metadata — fetched lazily for an externally-provided id. */
  const [selectedRow, setSelectedRow] = useState<EntityPickerRow | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Server-side search debounce timer.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the endpoint URL with limit + optional search.
  const buildUrl = useCallback(
    (q: string) => {
      const join = endpoint.includes('?') ? '&' : '?';
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (supportsServerSearch && q.trim()) params.set('search', q.trim());
      return `${endpoint}${join}${params.toString()}`;
    },
    [endpoint, supportsServerSearch],
  );

  const fetchRows = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(buildUrl(q));
        const json = (await r.json().catch(() => ({}))) as ApiResponse;
        if (!r.ok || !json.success) {
          setError(json.message || `HTTP ${r.status}`);
          setRows([]);
          return;
        }
        const mapped = pickItems(json)
          .map(displayRow)
          .filter((r): r is EntityPickerRow => r != null);
        setRows(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [buildUrl, displayRow],
  );

  // First-open + debounced re-fetch on query change.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchRows(query); }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, fetchRows]);

  // When the parent provides an externally-set value that we haven't seen yet,
  // try to resolve it from rows we've already loaded. If we don't know it yet,
  // we keep a placeholder chip with #id until the dropdown is opened and the
  // list fetch happens.
  useEffect(() => {
    if (value === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- value→selectedRow is a one-way mirror; this clear is the inverse and must happen when value drops.
      setSelectedRow(null);
      return;
    }
    const known = rows.find((r) => r.id === value);
    if (known) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating selectedRow from rows once we've fetched them. No loop risk: `rows` is the dep, `selectedRow` is an output.
      setSelectedRow(known);
    } else if (selectedRow?.id !== value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- placeholder chip for an id whose row hasn't been fetched yet.
      setSelectedRow({ id: value, primary: `#${value}`, secondary: 'Loading…' });
    }
  }, [value, rows, selectedRow?.id]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim() || supportsServerSearch) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.primary.toLowerCase().includes(q) || (r.secondary?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, query, supportsServerSearch]);

  const handleSelect = useCallback(
    (row: EntityPickerRow) => {
      onChange(row.id);
      setSelectedRow(row);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setSelectedRow(null);
  }, [onChange]);

  return (
    <div ref={containerRef} className="relative block">
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
        <span className="material-icons text-[14px] leading-none">{icon}</span>
        {label}
      </span>

      {selectedRow ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md border border-border bg-muted/40 hover:bg-muted hover:text-foreground transition-colors min-w-0 flex-1"
            title={selectedRow.secondary ?? selectedRow.primary}
          >
            <span className="material-icons text-[14px] leading-none text-primary shrink-0">{icon}</span>
            <span className="truncate text-left flex-1 min-w-0">{selectedRow.primary}</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
            aria-label={`Clear ${label}`}
          >
            <span className="material-icons text-[16px]">close</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full inline-flex items-center gap-1.5 px-2 py-1.5 text-sm bg-background border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          <span className="material-icons text-[14px] leading-none">search</span>
          <span className="text-xs">— select —</span>
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-72 rounded-md border border-border bg-popover shadow-lg p-2 space-y-2">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {error && (
            <div className="px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded">
              <span className="material-icons text-sm align-middle mr-1">error_outline</span>
              {error}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto -mx-1">
            {loading && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                <span className="material-icons text-sm animate-spin align-middle mr-1">progress_activity</span>
                Loading…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {query.trim() ? `No ${label.toLowerCase()} matches "${query.trim()}"` : `No ${label.toLowerCase()} found.`}
              </div>
            )}
            {!loading && filtered.map((row) => {
              const isSelected = row.id === value;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => handleSelect(row)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-accent ${
                    isSelected ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span className="material-icons text-base shrink-0">{icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{row.primary}</span>
                    {row.secondary && (
                      <span className="block text-[10px] text-muted-foreground truncate">{row.secondary}</span>
                    )}
                  </span>
                  {isSelected && <span className="material-icons text-sm shrink-0">check</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
