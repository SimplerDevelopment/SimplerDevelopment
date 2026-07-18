import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { SearchResults } from '../../lib/types';
import { Spinner } from '../components/Spinner';
import { EntityCard } from '../components/EntityCard';
import type { ToastLevel } from '../components/Toast';

interface Props {
  portalUrl: string;
  onToast(level: ToastLevel, text: string, href?: string): void;
}

export function SearchTab({ portalUrl, onToast }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const out = await api.search(q.trim(), 10);
        if (!cancelled) setResults(out);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          onToast('error', msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, onToast]);

  const portal = portalUrl.replace(/\/+$/, '');

  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="relative">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          autoFocus
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Brain, contacts, companies, deals..."
          className="w-full rounded-md border border-slate-200 bg-white pl-7 pr-8 py-2 text-sm outline-none focus:border-brand-500"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
            <Spinner size={14} />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-900 text-xs">
          {error}
        </div>
      )}

      {q.trim().length >= 2 && results && (
        <div className="space-y-3">
          <Group label="Notes" count={results.notes.length}>
            {results.notes.map((n) => (
              <EntityCard
                key={`n-${n.id}`}
                title={n.title}
                subtitle={n.snippet ?? n.sourceUrl ?? undefined}
                href={portal ? `${portal}/portal/brain/notes/${n.id}` : undefined}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                }
              />
            ))}
          </Group>

          <Group label="Contacts" count={results.contacts.length}>
            {results.contacts.map((c) => (
              <EntityCard
                key={`c-${c.id}`}
                title={[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || `#${c.id}`}
                subtitle={
                  [c.title, c.companyName].filter(Boolean).join(' · ') || c.email || undefined
                }
                href={portal ? `${portal}/portal/crm/contacts/${c.id}` : undefined}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                }
              />
            ))}
          </Group>

          <Group label="Companies" count={results.companies.length}>
            {results.companies.map((c) => (
              <EntityCard
                key={`co-${c.id}`}
                title={c.name}
                subtitle={[c.industry, c.domain].filter(Boolean).join(' · ') || undefined}
                href={portal ? `${portal}/portal/crm/companies/${c.id}` : undefined}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 21V9h6v12M3 9h18" />
                  </svg>
                }
              />
            ))}
          </Group>

          <Group label="Deals" count={results.deals.length}>
            {results.deals.map((d) => (
              <EntityCard
                key={`d-${d.id}`}
                title={d.title}
                subtitle={[d.stage, d.value ? `$${d.value}` : null].filter(Boolean).join(' · ') || undefined}
                href={portal ? `${portal}/portal/crm/deals/${d.id}` : undefined}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                }
              />
            ))}
          </Group>

          {results.notes.length +
            results.contacts.length +
            results.companies.length +
            results.deals.length ===
            0 && (
            <div className="text-center text-xs text-slate-400 py-6">No results.</div>
          )}
        </div>
      )}

      {q.trim().length < 2 && !loading && (
        <div className="text-center text-xs text-slate-400 py-12">
          Type at least 2 characters to search.
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-[10px] text-slate-400">{count}</div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
