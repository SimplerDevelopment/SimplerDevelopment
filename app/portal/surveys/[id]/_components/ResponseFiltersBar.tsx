'use client';

/**
 * ResponseFiltersBar — date range / source / keyword filter strip for the
 * survey responses tab (REQ RESP-01).
 *
 * Stateless — owns no filter state. Parent passes the current filters and an
 * onChange callback; the bar reads/writes via that callback so the parent
 * stays the single source of truth (and can sync filters into the URL).
 */

import { useEffect, useState } from 'react';
import { type ResponseFilters } from '../_lib/api';

const CANONICAL_SOURCES = ['link', 'email', 'embed', 'crm', 'booking'] as const;

interface Props {
  filters: ResponseFilters;
  onChange: (next: ResponseFilters) => void;
  /** Source values actually present on this survey's responses. Merged with
   *  the canonical list so users still see the full set of allowed values. */
  sourcesPresent: string[];
  /** Total responses currently visible. Surfaced inline so users can see at
   *  a glance how restrictive their filters are. */
  filteredCount: number;
}

export default function ResponseFiltersBar({ filters, onChange, sourcesPresent, filteredCount }: Props) {
  // Local-state mirror for the keyword input so typing feels snappy. We push
  // the value up on blur / Enter rather than every keystroke to avoid
  // hammering the API (and the URL bar) on every character. The effect
  // re-syncs when the parent (URL) clears or replaces `filters.q`.
  const [qDraft, setQDraft] = useState(filters.q ?? '');
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setQDraft(filters.q ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [filters.q]);

  const sourceOptions = Array.from(
    new Set<string>([...CANONICAL_SOURCES, ...sourcesPresent.filter(Boolean)]),
  );

  const hasAny = !!(filters.from || filters.to || filters.source || filters.q);

  const set = (patch: Partial<ResponseFilters>) => onChange({ ...filters, ...patch });
  const clear = () => onChange({ from: null, to: null, source: null, q: null });

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From">
          <input
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? undefined}
            onChange={(e) => set({ from: e.target.value || null })}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={filters.to ?? ''}
            min={filters.from ?? undefined}
            onChange={(e) => set({ to: e.target.value || null })}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
        <Field label="Source">
          <select
            value={filters.source ?? ''}
            onChange={(e) => set({ source: e.target.value || null })}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[120px]"
          >
            <option value="">All sources</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Search answers" grow>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground pointer-events-none">search</span>
            <input
              type="search"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onBlur={() => set({ q: qDraft.trim() || null })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  set({ q: qDraft.trim() || null });
                }
              }}
              placeholder="Keyword across answer values"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </Field>
        {hasAny && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/40 transition-colors"
          >
            <span className="material-icons text-base">clear</span>
            Clear
          </button>
        )}
      </div>
      {hasAny && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="material-icons text-sm">filter_alt</span>
          Showing {filteredCount} filtered response{filteredCount === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-muted-foreground ${grow ? 'flex-1 min-w-[180px]' : ''}`}>
      {label}
      {children}
    </label>
  );
}
