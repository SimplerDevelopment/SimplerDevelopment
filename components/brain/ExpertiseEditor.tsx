'use client';

/**
 * Inline expertise editor — used on the person profile page.
 *
 * Renders the person's expertise as chips with × to remove. The "+ Expertise"
 * trigger opens a popover with a searchable flat list of all tags (hits
 * `/api/portal/brain/expertise-tags?search=`). Each newly added or existing
 * chip has an optional level dropdown (1=novice → 4=expert).
 *
 * The editor is persistent: every change is immediately posted to the API
 * (`POST` to attach / update level, `DELETE` to detach) and the parent is
 * informed via `onChange` so it can re-render the surrounding profile.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ExpertiseChip {
  tagId: number;
  name: string;
  level: number | null;
}

interface TagOption {
  id: number;
  name: string;
}

interface ExpertiseEditorProps {
  personId: number;
  expertise: ExpertiseChip[];
  onChange: (next: ExpertiseChip[]) => void;
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'Novice',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
};

export function ExpertiseEditor({ personId, expertise, onChange }: ExpertiseEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<TagOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyTagId, setBusyTagId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Debounced search.
  useEffect(() => {
    if (!pickerOpen) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const url = new URL('/api/portal/brain/expertise-tags', window.location.origin);
        if (query.trim()) url.searchParams.set('search', query.trim());
        url.searchParams.set('limit', '50');
        const r = await fetch(url.toString());
        const json = await r.json();
        if (r.ok && json.success) {
          setOptions((json.data?.items ?? []) as TagOption[]);
        }
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, pickerOpen]);

  // Close popover on outside-click.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  const attach = useCallback(async (tag: TagOption, level: number | null) => {
    setBusyTagId(tag.id);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/people/${personId}/expertise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expertiseTagId: tag.id, level }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Could not attach tag');
        return;
      }
      const existsIdx = expertise.findIndex((c) => c.tagId === tag.id);
      const next = existsIdx >= 0
        ? expertise.map((c, i) => (i === existsIdx ? { ...c, level } : c))
        : [...expertise, { tagId: tag.id, name: tag.name, level }];
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusyTagId(null);
    }
  }, [personId, expertise, onChange]);

  const detach = useCallback(async (tagId: number) => {
    setBusyTagId(tagId);
    setError(null);
    try {
      const r = await fetch(
        `/api/portal/brain/people/${personId}/expertise?expertiseTagId=${tagId}`,
        { method: 'DELETE' },
      );
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Could not remove tag');
        return;
      }
      onChange(expertise.filter((c) => c.tagId !== tagId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusyTagId(null);
    }
  }, [personId, expertise, onChange]);

  const changeLevel = useCallback(async (tagId: number, level: number | null) => {
    // attach with same tag re-uses the row & updates the level
    const existing = expertise.find((c) => c.tagId === tagId);
    if (!existing) return;
    await attach({ id: tagId, name: existing.name }, level);
  }, [expertise, attach]);

  const attachedIds = new Set(expertise.map((c) => c.tagId));
  const visibleOptions = options.filter((o) => !attachedIds.has(o.id));

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {expertise.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No expertise tags yet.
          </span>
        )}
        {expertise.map((chip) => (
          <div
            key={chip.tagId}
            className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-primary/10 text-primary text-xs"
          >
            <span className="material-icons text-[14px]">label</span>
            <span className="font-medium">{chip.name}</span>
            <select
              value={chip.level ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                changeLevel(chip.tagId, v === '' ? null : parseInt(v, 10));
              }}
              disabled={busyTagId === chip.tagId}
              className="bg-transparent border-none text-[11px] cursor-pointer focus:outline-none"
              aria-label={`Level for ${chip.name}`}
            >
              <option value="">— level —</option>
              <option value="1">1 · Novice</option>
              <option value="2">2 · Intermediate</option>
              <option value="3">3 · Advanced</option>
              <option value="4">4 · Expert</option>
            </select>
            <button
              type="button"
              onClick={() => detach(chip.tagId)}
              disabled={busyTagId === chip.tagId}
              className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-primary/20"
              aria-label={`Remove ${chip.name}`}
            >
              <span className="material-icons text-[14px]">close</span>
            </button>
          </div>
        ))}

        <div ref={wrapRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50"
          >
            <span className="material-icons text-[14px]">add</span>
            Expertise
          </button>
          {pickerOpen && (
            <div className="absolute z-20 left-0 mt-1 w-72 bg-card border border-border rounded-md shadow-lg p-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search expertise tags…"
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <div className="mt-2 max-h-56 overflow-y-auto">
                {searching ? (
                  <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                    <span className="material-icons animate-spin text-sm">progress_activity</span>
                    Searching…
                  </div>
                ) : visibleOptions.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    {query.trim() ? 'No matches.' : 'Start typing to search.'}
                  </div>
                ) : (
                  <ul role="listbox">
                    {visibleOptions.map((opt) => (
                      <li key={opt.id}>
                        <button
                          type="button"
                          onClick={() => attach(opt, null)}
                          disabled={busyTagId === opt.id}
                          className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded flex items-center gap-2"
                        >
                          <span className="material-icons text-[14px] text-muted-foreground">label</span>
                          {opt.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground border-t border-border mt-1 pt-1">
                Tip: pick a level on the chip after attaching.
                <br />
                <span className="opacity-70">
                  Levels: {Object.entries(LEVEL_LABELS).map(([k, v]) => `${k}=${v}`).join(', ')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}
    </div>
  );
}

export default ExpertiseEditor;
