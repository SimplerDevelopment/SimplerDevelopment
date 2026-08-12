'use client';

// Pages tab — GET /seo/runs/[id]/pages returns the whole run (capped at
// maxPages, ≤1000 rows) and we sort/filter client-side per the API's own
// contract comment ("the client sorts locally").

import { useEffect, useMemo, useState } from 'react';
import { pCard, pInput } from '@/components/portal/portal-ui';
import type { SeoCrawlPageRow } from './types';

type SortKey = 'url' | 'httpStatus' | 'depth' | 'internalRank' | 'incomingLinks' | 'wordCount' | 'responseTimeMs';

function statusClasses(status: number | null): string {
  if (status == null) return 'text-muted-foreground';
  if (status >= 200 && status < 300) return 'text-green-600 dark:text-green-400';
  if (status >= 300 && status < 400) return 'text-blue-600 dark:text-blue-400';
  if (status >= 400) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

function SortHeader({
  id,
  label,
  activeKey,
  dir,
  onSort,
}: {
  id: SortKey;
  label: string;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === id;
  return (
    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
      <button type="button" onClick={() => onSort(id)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        {active && <span className="material-icons text-sm">{dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
      </button>
    </th>
  );
}

export function PagesTab({ runId }: { runId: number | null; runStatus: string | null }) {
  const [pages, setPages] = useState<SeoCrawlPageRow[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('internalRank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!runId) {
      setPages([]);
      return;
    }
    let cancelled = false;
    setPages(null);
    fetch(`/api/portal/seo/runs/${runId}/pages`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.message || 'Failed to load pages.');
          return;
        }
        setError('');
        setPages(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Network error loading pages.');
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const filtered = useMemo(() => {
    if (!pages) return [];
    const needle = filter.trim().toLowerCase();
    const rows = needle ? pages.filter((p) => p.url.toLowerCase().includes(needle)) : pages;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [pages, filter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  if (!runId) {
    return (
      <div className={`${pCard} p-10 text-center`}>
        <span className="material-icons text-4xl text-muted-foreground/50 mb-2">description</span>
        <p className="text-sm text-muted-foreground">No crawls yet. Run an audit to see crawled pages here.</p>
      </div>
    );
  }

  if (pages === null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin text-2xl">progress_activity</span>
      </div>
    );
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  if (pages.length === 0) {
    return (
      <div className={`${pCard} p-10 text-center`}>
        <p className="text-sm text-muted-foreground">No pages crawled yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <span className="material-icons text-muted-foreground text-lg absolute left-3 top-1/2 -translate-y-1/2">search</span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by URL…"
          className={`${pInput} pl-10`}
        />
      </div>

      <div className={`${pCard} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <SortHeader id="url" label="URL" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader id="httpStatus" label="Status" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Indexable</th>
              <SortHeader id="depth" label="Depth" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader id="internalRank" label="Rank" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader id="incomingLinks" label="Inbound" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader id="wordCount" label="Words" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader id="responseTimeMs" label="Time" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                <td className="px-3 py-2 max-w-xs">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline truncate block"
                    title={p.url}
                  >
                    {p.url}
                  </a>
                </td>
                <td className={`px-3 py-2 font-mono ${statusClasses(p.httpStatus)}`}>{p.httpStatus ?? '—'}</td>
                <td className="px-3 py-2 max-w-xs truncate text-muted-foreground" title={p.title ?? undefined}>
                  {p.title || <span className="italic">Missing</span>}
                </td>
                <td className="px-3 py-2">
                  {p.indexable === true ? (
                    <span className="text-green-600 dark:text-green-400">
                      <span className="material-icons text-sm">check</span>
                    </span>
                  ) : p.indexable === false ? (
                    <span className="text-red-600 dark:text-red-400" title={p.indexabilityReason ?? undefined}>
                      <span className="material-icons text-sm">close</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.depth}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                  {p.internalRank != null ? p.internalRank.toFixed(3) : '—'}
                  {p.orphan && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      orphan
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.incomingLinks}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.wordCount}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {p.responseTimeMs != null ? `${p.responseTimeMs}ms` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {pages.length} pages
      </p>
    </div>
  );
}
