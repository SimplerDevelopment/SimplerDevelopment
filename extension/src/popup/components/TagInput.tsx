import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { api } from '../../lib/api';

interface Props {
  value: string[];
  onChange(next: string[]): void;
  suggestions?: string[];
  placeholder?: string;
}

export function TagInput({ value, onChange, suggestions = [], placeholder }: Props) {
  const [draft, setDraft] = useState('');
  const [fetchedTags, setFetchedTags] = useState<string[]>([]);
  // Request-counter pattern: each fetch bumps `reqIdRef`. When a response
  // comes back, we only commit it if its captured id still matches the
  // latest issued id — older in-flight responses are discarded so they
  // can't clobber newer queries.
  const reqIdRef = useRef(0);

  function add(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t]);
  }

  function remove(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && draft === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  // Debounced fetch of tenant tag suggestions.
  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed.length < 1) {
      setFetchedTags([]);
      return;
    }
    const myReqId = ++reqIdRef.current;
    const t = setTimeout(async () => {
      try {
        const out = await api.listTags(trimmed, 8);
        // Only commit if no newer request has started since we issued.
        if (myReqId === reqIdRef.current) {
          setFetchedTags(out.items.map((it) => it.tag));
        }
      } catch {
        if (myReqId === reqIdRef.current) {
          setFetchedTags([]);
        }
      }
    }, 200);
    return () => clearTimeout(t);
  }, [draft]);

  // Merge AI suggestions first, then fetched tags; dedupe case-insensitively
  // and exclude tags already in `value`.
  const merged = (() => {
    const seen = new Set<string>(value.map((v) => v.toLowerCase()));
    const out: string[] = [];
    for (const s of suggestions) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    for (const s of fetchedTags) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  })();

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 focus-within:border-brand-500">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="opacity-60 hover:opacity-100"
              aria-label={`Remove ${tag}`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={value.length === 0 ? (placeholder ?? 'Add tags...') : ''}
          className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {merged.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {merged.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                add(s);
                setDraft('');
              }}
              className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-700"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
