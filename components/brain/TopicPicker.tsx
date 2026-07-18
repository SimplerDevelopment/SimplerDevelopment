'use client';

/**
 * TopicPicker — chip-based selector for brain topics.
 *
 * Displays the currently selected topics as removable chips, with a "+ Topic"
 * button that opens a popover containing a searchable flat list of every
 * topic the tenant owns. The flat list is fetched lazily on first open and
 * cached in component state — subsequent opens reuse it.
 *
 * If `allowCreate` is true, a no-match search shows an "Add new topic '<q>'"
 * row at the bottom of the popover; clicking it POSTs to
 * `/api/portal/brain/topics` and adds the new id to the selection.
 *
 * No drag-drop. Purely additive selection. Side panes (decision form, note
 * editor) feed `selectedTopicIds` and `onChange`; the picker stays controlled.
 *
 * Wave 3b — see .planning/brain-restructure/PLAN.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrainTopic } from '@/lib/brain/topics';

export interface TopicPickerProps {
  selectedTopicIds: number[];
  onChange: (topicIds: number[]) => void;
  allowCreate?: boolean;
  placeholder?: string;
  /** Optional className applied to the outer container. */
  className?: string;
}

interface TopicSummary {
  id: number;
  name: string;
  path: string;
  icon: string | null;
  color: string | null;
}

export default function TopicPicker({
  selectedTopicIds,
  onChange,
  allowCreate = false,
  placeholder = 'Add topic…',
  className,
}: TopicPickerProps) {
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState<TopicSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load on first open.
  useEffect(() => {
    if (!open || topics !== null || loading) return;
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetch('/api/portal/brain/topics?as=flat')
      .then((r) => r.json().catch(() => ({})))
      .then((json) => {
        if (cancelled) return;
        if (!json?.success) {
          setError(json?.message || 'Failed to load topics.');
          return;
        }
        const items: BrainTopic[] = json.data?.items ?? [];
        setTopics(items.map((t) => ({
          id: t.id,
          name: t.name,
          path: t.path,
          icon: t.icon ?? null,
          color: t.color ?? null,
        })));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, topics, loading]);

  // Click-outside closes the popover.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedTopicIds), [selectedTopicIds]);
  const selectedTopics = useMemo(() => {
    if (!topics) return [] as TopicSummary[];
    return selectedTopicIds
      .map((id) => topics.find((t) => t.id === id))
      .filter((t): t is TopicSummary => t != null);
  }, [topics, selectedTopicIds]);

  const filtered = useMemo(() => {
    if (!topics) return [] as TopicSummary[];
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q));
  }, [topics, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !topics) return false;
    return topics.some((t) => t.name.toLowerCase() === q);
  }, [topics, query]);

  const handleAdd = useCallback((id: number) => {
    if (selectedSet.has(id)) return;
    onChange([...selectedTopicIds, id]);
  }, [selectedSet, selectedTopicIds, onChange]);

  const handleRemove = useCallback((id: number) => {
    onChange(selectedTopicIds.filter((tid) => tid !== id));
  }, [selectedTopicIds, onChange]);

  const handleCreate = useCallback(async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json?.message || `Create failed (${r.status}).`);
        return;
      }
      const created: BrainTopic = json.data;
      const summary: TopicSummary = {
        id: created.id,
        name: created.name,
        path: created.path,
        icon: created.icon ?? null,
        color: created.color ?? null,
      };
      setTopics((prev) => (prev ? [...prev, summary] : [summary]));
      onChange([...selectedTopicIds, created.id]);
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  }, [query, creating, onChange, selectedTopicIds]);

  // For chips: if we haven't loaded `topics` yet but have ids, render a
  // placeholder chip with just the id so the row still acknowledges them.
  const placeholderChips = useMemo(() => {
    if (topics !== null) return [] as number[];
    return selectedTopicIds.filter((id) => !selectedTopics.find((t) => t.id === id));
  }, [topics, selectedTopicIds, selectedTopics]);

  return (
    <div className={`relative ${className ?? ''}`} ref={containerRef}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {selectedTopics.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-border bg-muted/40 text-xs text-foreground"
            title={t.path}
          >
            <span
              className="material-icons text-sm"
              style={t.color ? { color: t.color } : undefined}
            >
              {t.icon || 'sell'}
            </span>
            <span className="truncate max-w-[12rem]">{t.name}</span>
            <button
              type="button"
              onClick={() => handleRemove(t.id)}
              className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${t.name}`}
            >
              <span className="material-icons text-[14px]">close</span>
            </button>
          </span>
        ))}
        {placeholderChips.map((id) => (
          <span
            key={`ph-${id}`}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-border bg-muted/40 text-xs text-muted-foreground"
            title={`Topic #${id}`}
          >
            <span className="material-icons text-sm">sell</span>
            <span>#{id}</span>
            <button
              type="button"
              onClick={() => handleRemove(id)}
              className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              aria-label={`Remove topic ${id}`}
            >
              <span className="material-icons text-[14px]">close</span>
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-border bg-transparent text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40"
        >
          <span className="material-icons text-sm">add</span>
          Topic
        </button>
      </div>

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-72 rounded-md border border-border bg-popover shadow-lg p-2 space-y-2">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
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
            {!loading && topics && filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No topics match.
              </div>
            )}
            {!loading && filtered.map((t) => {
              const isSelected = selectedSet.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) handleRemove(t.id);
                    else handleAdd(t.id);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-accent ${
                    isSelected ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span
                    className="material-icons text-base shrink-0"
                    style={t.color ? { color: t.color } : undefined}
                  >
                    {t.icon || 'sell'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{t.name}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">{t.path}</span>
                  </span>
                  {isSelected && (
                    <span className="material-icons text-sm shrink-0">check</span>
                  )}
                </button>
              );
            })}
          </div>

          {allowCreate && query.trim() && !exactMatch && !loading && (
            <div className="border-t border-border pt-1">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-sm hover:bg-accent disabled:opacity-50 text-primary"
              >
                {creating ? (
                  <span className="material-icons text-sm animate-spin">progress_activity</span>
                ) : (
                  <span className="material-icons text-sm">add_circle</span>
                )}
                <span>Add new topic &ldquo;<strong>{query.trim()}</strong>&rdquo;</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
