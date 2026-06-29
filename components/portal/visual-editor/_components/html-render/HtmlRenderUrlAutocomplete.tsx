'use client';

// ─── HtmlRenderUrlAutocomplete — URL field with internal-link suggestions ───
// Plain URL input with a dropdown of internal links the author can drop in:
// CMS posts on the active site, the client's other pitch decks, booking pages,
// and CRM proposals. Always allows freeform typing — the suggestions are an
// accelerator, not a constraint.
//
// Suggestions are fetched once on mount from /api/portal/url-suggestions and
// filtered client-side as the author types.

import React, { useState, useEffect, useRef } from 'react';

interface UrlSuggestion { id: number; label: string; url: string; sublabel?: string }
interface UrlSuggestionGroups {
  posts: UrlSuggestion[];
  decks: UrlSuggestion[];
  bookings: UrlSuggestion[];
  proposals: UrlSuggestion[];
}

const SUGGESTION_GROUP_META: Array<{ key: keyof UrlSuggestionGroups; icon: string; label: string }> = [
  { key: 'posts', icon: 'description', label: 'Pages' },
  { key: 'decks', icon: 'slideshow', label: 'Pitch Decks' },
  { key: 'bookings', icon: 'event', label: 'Booking Pages' },
  { key: 'proposals', icon: 'request_quote', label: 'Proposals' },
];

function filterSuggestions(items: UrlSuggestion[], q: string): UrlSuggestion[] {
  if (!q) return items.slice(0, 8);
  return items
    .filter(it => it.label.toLowerCase().includes(q) || it.url.toLowerCase().includes(q))
    .slice(0, 8);
}

export function HtmlRenderUrlAutocomplete({
  label,
  value,
  onChange,
  siteId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  siteId?: number;
}) {
  const [groups, setGroups] = useState<UrlSuggestionGroups | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = siteId ? `?siteId=${siteId}` : '';
        const res = await fetch(`/api/portal/url-suggestions${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data) setGroups(json.data as UrlSuggestionGroups);
      } catch {
        /* leave groups as null — input still works as plain text */
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const q = value.trim().toLowerCase();
  const filteredGroups: UrlSuggestionGroups | null = groups
    ? {
        posts: filterSuggestions(groups.posts, q),
        decks: filterSuggestions(groups.decks, q),
        bookings: filterSuggestions(groups.bookings, q),
        proposals: filterSuggestions(groups.proposals, q),
      }
    : null;

  const totalCount = filteredGroups
    ? filteredGroups.posts.length + filteredGroups.decks.length + filteredGroups.bookings.length + filteredGroups.proposals.length
    : 0;

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="https:// or pick a link below"
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </label>
      {open && filteredGroups && totalCount > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded border border-border bg-popover shadow-lg">
          {SUGGESTION_GROUP_META.map(({ key, icon, label: groupLabel }) => {
            const items = filteredGroups[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className="py-1">
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="material-icons text-sm">{icon}</span>
                  {groupLabel}
                </div>
                {items.map((item) => (
                  <button
                    type="button"
                    key={`${key}-${item.id}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(item.url); setOpen(false); }}
                    className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-foreground">{item.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground font-mono">{item.url}</div>
                    </div>
                    {item.sublabel && (
                      <span className="text-[10px] text-muted-foreground/80 mt-0.5 shrink-0">{item.sublabel}</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
