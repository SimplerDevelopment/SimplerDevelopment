'use client';

/**
 * GlossaryTermForm — create / edit form for a single glossary term.
 *
 * Used by both:
 *   - `/portal/brain/glossary/new`          (mode='create')
 *   - `/portal/brain/glossary/[id]` edit    (mode='edit')
 *
 * Fields:
 *   - term          (text, required)
 *   - definition    (textarea, markdown supported, required)
 *   - shortDefinition (text, max 500)
 *   - aliases       (chip input — Enter to add, backspace at empty removes last)
 *   - status        (radio: active | deprecated)
 *   - category      (combobox — type-or-pick from existing categories)
 *   - ownerId       (user picker via /api/portal/mentionable-users)
 *   - relatedTermIds (multi-select with search via list endpoint)
 *
 * On success calls `onSaved(result)` with the created/updated record. The
 * page that mounts this component owns the redirect / refresh side effects.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrainGlossaryStatus } from '@/lib/db/schema';

interface UserOption {
  id: number;
  name: string | null;
}

interface RelatedTermPick {
  id: number;
  term: string;
  slug: string;
}

export interface GlossaryFormValue {
  term: string;
  definition: string;
  shortDefinition: string;
  aliases: string[];
  status: BrainGlossaryStatus;
  category: string;
  ownerId: number | null;
  relatedTermIds: number[];
}

interface Props {
  mode: 'create' | 'edit';
  initial?: Partial<GlossaryFormValue>;
  /** Existing related term records — populated by the parent for edit mode. */
  initialRelatedTerms?: RelatedTermPick[];
  termId?: number;
  onSaved: (saved: { id: number }) => void;
  onCancel?: () => void;
}

const EMPTY: GlossaryFormValue = {
  term: '',
  definition: '',
  shortDefinition: '',
  aliases: [],
  status: 'active',
  category: '',
  ownerId: null,
  relatedTermIds: [],
};

export default function GlossaryTermForm({
  mode,
  initial,
  initialRelatedTerms = [],
  termId,
  onSaved,
  onCancel,
}: Props) {
  const [value, setValue] = useState<GlossaryFormValue>({ ...EMPTY, ...initial });
  const [aliasDraft, setAliasDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categories + users + related-term-search load lazily.
  const [categories, setCategories] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [relatedPicks, setRelatedPicks] = useState<RelatedTermPick[]>(initialRelatedTerms);
  const [relatedQuery, setRelatedQuery] = useState('');
  const [relatedSearchResults, setRelatedSearchResults] = useState<RelatedTermPick[]>([]);
  const [relatedSearching, setRelatedSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load categories (distinct list from the full list endpoint).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/brain/glossary?limit=100');
        const json = await r.json();
        if (cancelled || !json.success) return;
        const cats = Array.from(new Set<string>(
          (json.data?.items ?? [])
            .map((it: { category: string | null }) => it.category)
            .filter((c: string | null): c is string => !!c && c.trim().length > 0),
        )).sort();
        setCategories(cats);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load users (mentionable-users covers staff + members of active client).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/mentionable-users');
        const json = await r.json();
        if (cancelled || !json.success) return;
        setUsers(json.data ?? []);
      } catch {
        /* non-fatal — owner picker degrades to numeric id input */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced related-term search. All setState happens inside an async
  // callback so the effect body itself never calls setState synchronously
  // (react-hooks/set-state-in-effect would otherwise flag this).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      if (cancelled) return;
      const q = relatedQuery.trim();
      if (!q) {
        setRelatedSearchResults([]);
        setRelatedSearching(false);
        return;
      }
      setRelatedSearching(true);
      try {
        const r = await fetch(`/api/portal/brain/glossary?search=${encodeURIComponent(q)}&limit=10`);
        const json = await r.json();
        if (cancelled) return;
        if (json.success) {
          const items: RelatedTermPick[] = (json.data?.items ?? [])
            .filter((it: { id: number }) => it.id !== termId)
            .map((it: { id: number; term: string; slug: string }) => ({
              id: it.id, term: it.term, slug: it.slug,
            }));
          setRelatedSearchResults(items);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setRelatedSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [relatedQuery, termId]);

  const set = <K extends keyof GlossaryFormValue>(k: K, v: GlossaryFormValue[K]) =>
    setValue(prev => ({ ...prev, [k]: v }));

  const addAlias = useCallback((raw: string) => {
    const a = raw.trim();
    if (!a) return;
    setValue(prev => prev.aliases.includes(a)
      ? prev
      : { ...prev, aliases: [...prev.aliases, a] });
    setAliasDraft('');
  }, []);

  const removeAlias = useCallback((idx: number) => {
    setValue(prev => ({ ...prev, aliases: prev.aliases.filter((_, i) => i !== idx) }));
  }, []);

  const handleAliasKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addAlias(aliasDraft);
    } else if (e.key === 'Backspace' && !aliasDraft && value.aliases.length > 0) {
      removeAlias(value.aliases.length - 1);
    }
  };

  const addRelated = useCallback((pick: RelatedTermPick) => {
    setValue(prev => prev.relatedTermIds.includes(pick.id)
      ? prev
      : { ...prev, relatedTermIds: [...prev.relatedTermIds, pick.id] });
    setRelatedPicks(prev => prev.find(p => p.id === pick.id) ? prev : [...prev, pick]);
    setRelatedQuery('');
    setRelatedSearchResults([]);
  }, []);

  const removeRelated = useCallback((id: number) => {
    setValue(prev => ({ ...prev, relatedTermIds: prev.relatedTermIds.filter(n => n !== id) }));
    setRelatedPicks(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Auto-add a pending alias draft so users don't lose it.
    const aliases = aliasDraft.trim() && !value.aliases.includes(aliasDraft.trim())
      ? [...value.aliases, aliasDraft.trim()]
      : value.aliases;

    if (!value.term.trim()) { setError('Term is required.'); return; }
    if (!value.definition.trim()) { setError('Definition is required.'); return; }

    setSubmitting(true);
    try {
      const url = mode === 'create'
        ? '/api/portal/brain/glossary'
        : `/api/portal/brain/glossary/${termId}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const body = {
        term: value.term.trim(),
        definition: value.definition,
        shortDefinition: value.shortDefinition.trim() || null,
        aliases,
        status: value.status,
        category: value.category.trim() || null,
        ownerId: value.ownerId,
        relatedTermIds: value.relatedTermIds,
      };
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Save failed');
        setSubmitting(false);
        return;
      }
      const saved = json.data as { id: number };
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive flex items-start gap-2">
          <span className="material-icons text-base">error_outline</span>
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="gl-term" className="block text-xs font-medium text-muted-foreground mb-1">
          Term <span className="text-destructive">*</span>
        </label>
        <input
          id="gl-term"
          type="text"
          required
          maxLength={200}
          value={value.term}
          onChange={e => set('term', e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="e.g. SSO"
        />
      </div>

      <div>
        <label htmlFor="gl-def" className="block text-xs font-medium text-muted-foreground mb-1">
          Definition <span className="text-destructive">*</span>
          <span className="ml-2 text-[10px] text-muted-foreground/70 font-normal">markdown supported</span>
        </label>
        <textarea
          id="gl-def"
          required
          rows={6}
          value={value.definition}
          onChange={e => set('definition', e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Full canonical definition. Markdown is allowed."
        />
      </div>

      <div>
        <label htmlFor="gl-short" className="block text-xs font-medium text-muted-foreground mb-1">
          Short definition <span className="text-[10px] text-muted-foreground/70 font-normal">(shown inline; max 500)</span>
        </label>
        <input
          id="gl-short"
          type="text"
          maxLength={500}
          value={value.shortDefinition}
          onChange={e => set('shortDefinition', e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="One-sentence summary."
        />
        <div className="mt-0.5 text-[10px] text-muted-foreground/70 text-right">
          {value.shortDefinition.length} / 500
        </div>
      </div>

      <div>
        <label htmlFor="gl-aliases" className="block text-xs font-medium text-muted-foreground mb-1">
          Aliases <span className="text-[10px] text-muted-foreground/70 font-normal">(press Enter or comma to add)</span>
        </label>
        <div className="flex flex-wrap gap-1.5 px-2 py-2 bg-background border border-border rounded-lg focus-within:ring-2 focus-within:ring-primary/50">
          {value.aliases.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-primary/10 text-primary border border-primary/20">
              <span className="material-icons text-[12px]">account_circle</span>
              {a}
              <button
                type="button"
                onClick={() => removeAlias(i)}
                className="ml-0.5 text-primary/70 hover:text-primary"
                aria-label={`Remove ${a}`}
              >
                <span className="material-icons text-[12px]">close</span>
              </button>
            </span>
          ))}
          <input
            id="gl-aliases"
            type="text"
            value={aliasDraft}
            onChange={e => setAliasDraft(e.target.value)}
            onKeyDown={handleAliasKeyDown}
            onBlur={() => aliasDraft.trim() && addAlias(aliasDraft)}
            className="flex-1 min-w-[8rem] bg-transparent border-0 focus:outline-none text-sm py-0.5"
            placeholder={value.aliases.length === 0 ? 'single sign-on, sign-in, …' : ''}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <span className="block text-xs font-medium text-muted-foreground mb-1">Status</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-1">
            {(['active', 'deprecated'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => set('status', s)}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  value.status === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="gl-category" className="block text-xs font-medium text-muted-foreground mb-1">
            Category
          </label>
          <input
            id="gl-category"
            type="text"
            list="gl-category-list"
            maxLength={100}
            value={value.category}
            onChange={e => set('category', e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Type new or pick existing"
          />
          <datalist id="gl-category-list">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      <div>
        <label htmlFor="gl-owner" className="block text-xs font-medium text-muted-foreground mb-1">
          Owner <span className="text-[10px] text-muted-foreground/70 font-normal">(canonical contact)</span>
        </label>
        {users.length > 0 ? (
          <select
            id="gl-owner"
            value={value.ownerId ?? ''}
            onChange={e => set('ownerId', e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">— No owner —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name ?? `User #${u.id}`}</option>
            ))}
          </select>
        ) : (
          // TODO(brain-glossary): no user picker available — fallback to raw id input.
          <input
            id="gl-owner"
            type="number"
            min={1}
            value={value.ownerId ?? ''}
            onChange={e => set('ownerId', e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Numeric user ID"
          />
        )}
      </div>

      <div>
        <span className="block text-xs font-medium text-muted-foreground mb-1">
          See also <span className="text-[10px] text-muted-foreground/70 font-normal">(related glossary terms)</span>
        </span>
        {relatedPicks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {relatedPicks.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-muted text-foreground border border-border">
                <span className="material-icons text-[12px]">menu_book</span>
                {p.term}
                <button
                  type="button"
                  onClick={() => removeRelated(p.id)}
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${p.term}`}
                >
                  <span className="material-icons text-[12px]">close</span>
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <input
            type="text"
            value={relatedQuery}
            onChange={e => setRelatedQuery(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Search to add a related term…"
          />
          {(relatedSearchResults.length > 0 || relatedSearching) && (
            <div className="absolute z-10 mt-1 left-0 right-0 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-md">
              {relatedSearching && (
                <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <span className="material-icons text-base animate-spin">progress_activity</span>
                  Searching…
                </div>
              )}
              {relatedSearchResults.map(r => {
                const already = value.relatedTermIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={already}
                    onClick={() => addRelated(r)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 ${
                      already ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <span className="material-icons text-base text-muted-foreground">menu_book</span>
                    <span className="flex-1">{r.term}</span>
                    {already && <span className="text-[10px] text-muted-foreground">added</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting
            ? <><span className="material-icons text-base animate-spin">progress_activity</span>Saving…</>
            : <><span className="material-icons text-base">save</span>{mode === 'create' ? 'Create term' : 'Save changes'}</>
          }
        </button>
      </div>
    </form>
  );
}
