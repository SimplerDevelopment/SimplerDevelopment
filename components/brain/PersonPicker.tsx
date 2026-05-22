'use client';

/**
 * Reusable typeahead picker for brain people.
 *
 * Calls GET /api/portal/brain/people?search=<q>&limit=20 on every keystroke
 * (debounced 200ms) and renders a popover of matches. Selecting a row fires
 * `onChange(personId)`; clearing fires `onChange(null)`.
 *
 * Used by:
 *   - the New Person form (managerId)
 *   - org-chart "add member" flows
 *   - any other surface that needs to point at a single person by id
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface PickerRow {
  id: number;
  fullName: string;
  title: string | null;
}

interface PersonPickerProps {
  value?: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  /** People to hide from results — e.g. exclude self when picking a manager. */
  excludeIds?: number[];
  /** Disabled-state passthrough. */
  disabled?: boolean;
}

export function PersonPicker({
  value,
  onChange,
  placeholder = 'Search people…',
  excludeIds = [],
  disabled = false,
}: PersonPickerProps) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<PickerRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // When `value` is set externally (e.g. on mount with an existing manager),
  // resolve its label by hitting GET /api/portal/brain/people/<id>. All
  // setState calls live inside the async IIFE so the effect body never
  // mutates state synchronously (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (value === null || value === undefined) {
        if (!cancelled) setSelectedLabel(null);
        return;
      }
      try {
        const r = await fetch(`/api/portal/brain/people/${value}`);
        const json = await r.json();
        if (!cancelled && r.ok && json.success && json.data?.person) {
          setSelectedLabel(json.data.person.fullName);
        }
      } catch {
        // ignore — label stays null, picker shows id-less placeholder
      }
    })();
    return () => { cancelled = true; };
  }, [value]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL('/api/portal/brain/people', window.location.origin);
        if (query.trim()) url.searchParams.set('search', query.trim());
        url.searchParams.set('limit', '20');
        const r = await fetch(url.toString());
        const json = await r.json();
        if (r.ok && json.success) {
          const items = (json.data?.items ?? []) as PickerRow[];
          setRows(items.filter((it) => !excludeIds.includes(it.id)));
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, excludeIds]);

  // Close on outside-click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleSelect = useCallback((row: PickerRow) => {
    onChange(row.id);
    setSelectedLabel(row.fullName);
    setOpen(false);
    setQuery('');
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
    setSelectedLabel(null);
    setQuery('');
  }, [onChange]);

  return (
    <div ref={wrapRef} className="relative">
      {value && selectedLabel ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-md bg-card text-sm">
          <span className="material-icons text-base text-muted-foreground">person</span>
          <span className="flex-1 truncate text-foreground">{selectedLabel}</span>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear selection"
            >
              <span className="material-icons text-base">close</span>
            </button>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
      )}
      {open && !value && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-card border border-border rounded-md shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <span className="material-icons animate-spin text-sm">progress_activity</span>
              Searching…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {query.trim() ? 'No matches.' : 'Start typing to search.'}
            </div>
          ) : (
            <ul role="listbox">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(row)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                  >
                    <span className="material-icons text-base text-muted-foreground">person</span>
                    <span className="flex-1 truncate">
                      <span className="text-foreground">{row.fullName}</span>
                      {row.title ? (
                        <span className="text-muted-foreground"> · {row.title}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default PersonPicker;
