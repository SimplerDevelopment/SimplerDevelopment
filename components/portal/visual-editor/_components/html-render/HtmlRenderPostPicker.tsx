'use client';

// ─── HtmlRenderPostPicker — fetches posts on this site for the `post` type ──
// Exposes a search + dropdown UI. Stores the selected post id as a string.
// Server-side resolution lives in lib/blocks/html-render-loops.ts (it turns
// the saved id into a `{ id, title, slug, url, ... }` record at render time
// so {{name.title}} / {{name.url}} resolve.)

import React, { useState, useEffect } from 'react';

interface PickerPostOption { id: number; title: string; slug: string; postType: string; }

export function HtmlRenderPostPicker({
  label,
  value,
  postType,
  onChange,
  siteId,
}: {
  label: string;
  value: string;
  postType?: string;
  onChange: (v: string) => void;
  siteId?: number;
}) {
  const [options, setOptions] = useState<PickerPostOption[] | null>(null);
  const [error, setError] = useState<string | null>(!siteId ? 'No site context — picker disabled' : null);

  useEffect(() => {
    if (!siteId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/portal/cms/websites/${siteId}/posts/picker` + (postType ? `?postType=${encodeURIComponent(postType)}` : '');
        const res = await fetch(url);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) setOptions(json.data);
        else setError(json?.message || json?.error || 'Failed to load posts');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load posts');
      }
    })();
    return () => { cancelled = true; };
  }, [postType, siteId]);

  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {error ? (
        <div className="mt-1 text-xs text-destructive">{error}</div>
      ) : !options ? (
        <div className="mt-1 text-xs text-muted-foreground">Loading posts…</div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">— Select a post —</option>
          {options.map(o => (
            <option key={o.id} value={String(o.id)}>{o.title} ({o.postType})</option>
          ))}
        </select>
      )}
      {!postType && (
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">All post types. Set a postType in the schema to filter.</p>
      )}
    </label>
  );
}
