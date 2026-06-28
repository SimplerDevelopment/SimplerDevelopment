/**
 * CrmCompanyTypeaheadPicker — typeahead combobox for selecting a CRM company.
 *
 * Hits `/api/portal/crm/companies?q=<query>` (capped at 50 results, projection
 * is `{ id, name, logoUrl }`). Replaces the legacy "load first 200 into a
 * native <select>" pattern that the company list outgrew (see perf/phase1).
 *
 * UX:
 *   - Empty input → "Type 2+ characters to search…"
 *   - 200ms debounce on the input
 *   - In-flight requests are aborted when the query changes
 *   - The pre-selected company is rendered as the closed-state label, so an
 *     edit form can show "Acme Co" even before any search has happened.
 *
 * The component intentionally keeps the API tiny — caller owns the selected
 * id+name; this surface only emits change events and renders a dropdown.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CompanyOption {
  id: number;
  name: string;
  logoUrl?: string | null;
}

interface Props {
  /** Currently-selected company id (as string for symmetry with native selects). */
  value: string;
  /** Display label for the current selection (e.g. an existing record's
   *  company name). Allows the closed-state to read like a normal select
   *  without round-tripping just to render the label. */
  selectedLabel?: string | null;
  /** Fired with the new option ({} when cleared). */
  onChange: (selected: CompanyOption | null) => void;
  /** Optional placeholder for the empty/no-selection state. */
  placeholder?: string;
  /** Disables interaction. */
  disabled?: boolean;
  /** Forwarded to the visible <button>/input for testing + styling parity. */
  className?: string;
  /** "None" sentinel label for the clear-selection menu item. Pass null to hide it. */
  noneLabel?: string | null;
}

const DEBOUNCE_MS = 200;
const MIN_QUERY = 2;

export default function CrmCompanyTypeaheadPicker({
  value,
  selectedLabel,
  onChange,
  placeholder = 'Search companies…',
  disabled = false,
  className,
  noneLabel = 'None',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounce + abort the typeahead fetch. Anything under MIN_QUERY chars
  // bypasses the network entirely so we don't hammer the endpoint when the
  // user is mid-type or hasn't started typing.
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < MIN_QUERY) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/portal/crm/companies?q=${encodeURIComponent(query.trim())}`, {
        signal: ctrl.signal,
      })
        .then(r => r.json())
        .then(d => {
          const rows = d?.data?.companies ?? d?.data ?? [];
          setResults(Array.isArray(rows) ? rows : []);
          setLoading(false);
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    // Focus the input on next paint so the dropdown actually has time to mount.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [disabled]);

  function selectOption(opt: CompanyOption | null) {
    onChange(opt);
    setOpen(false);
    setQuery('');
  }

  const displayResults = query.trim().length < MIN_QUERY ? [] : results;

  const baseClass =
    'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';
  const displayClass = className ?? baseClass;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={`${displayClass} text-left flex items-center justify-between gap-2 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={value && selectedLabel ? 'text-foreground truncate' : 'text-muted-foreground truncate'}>
          {value && selectedLabel ? selectedLabel : placeholder}
        </span>
        <span className="material-icons text-base text-muted-foreground shrink-0">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search companies…"
              className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {noneLabel !== null && (
              <button
                type="button"
                onClick={() => selectOption(null)}
                className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                {noneLabel}
              </button>
            )}
            {query.trim().length < MIN_QUERY ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                Type {MIN_QUERY}+ characters to search…
              </p>
            ) : loading ? (
              <p className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <span className="material-icons animate-spin text-sm">refresh</span>
                Searching…
              </p>
            ) : displayResults.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No companies match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              displayResults.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectOption(c)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                >
                  {c.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logoUrl}
                      alt=""
                      className="w-5 h-5 rounded object-cover shrink-0"
                    />
                  ) : (
                    <span className="material-icons text-base text-muted-foreground shrink-0">
                      business
                    </span>
                  )}
                  <span className="truncate">{c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
