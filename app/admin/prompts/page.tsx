'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LatestRun {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  passRate: number;
  passed: number;
  total: number;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}

interface PromptRow {
  id: number;
  key: string;
  title: string;
  activeVersionId: number | null;
  activeVersion: number | null;
  latestRun: LatestRun | null;
  trend: 'up' | 'down' | 'flat' | null;
}

function fmtAge(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toLocaleString();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function passRateBadgeClass(rate: number): string {
  if (rate >= 0.9) return 'bg-green-100 text-green-800 border-green-200';
  if (rate >= 0.7) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function statusBadgeClass(status: LatestRun['status']): string {
  switch (status) {
    case 'done':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'running':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'queued':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200';
  }
}

function statusIcon(status: LatestRun['status']): string {
  switch (status) {
    case 'done':
      return 'check_circle';
    case 'running':
      return 'refresh';
    case 'queued':
      return 'schedule';
    case 'failed':
      return 'error';
  }
}

function TrendIcon({ trend }: { trend: PromptRow['trend'] }) {
  if (trend === 'up') {
    return <span className="material-icons text-base text-green-600">trending_up</span>;
  }
  if (trend === 'down') {
    return <span className="material-icons text-base text-red-600">trending_down</span>;
  }
  if (trend === 'flat') {
    return <span className="material-icons text-base text-gray-400">trending_flat</span>;
  }
  return <span className="text-muted-foreground text-sm">—</span>;
}

type SortKey = 'title' | 'passRate' | 'lastRun';
type SortDir = 'asc' | 'desc';

function sortedPrompts(rows: PromptRow[], key: SortKey, dir: SortDir): PromptRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    if (key === 'title') {
      cmp = a.title.localeCompare(b.title);
    } else if (key === 'passRate') {
      const av = a.latestRun?.passRate ?? null;
      const bv = b.latestRun?.passRate ?? null;
      if (av === null && bv === null) cmp = 0;
      else if (av === null) cmp = 1; // nulls last
      else if (bv === null) cmp = -1;
      else cmp = av - bv;
    } else {
      // lastRun — sort by latestRun.createdAt
      const at = a.latestRun?.createdAt ?? null;
      const bt = b.latestRun?.createdAt ?? null;
      if (at === null && bt === null) cmp = 0;
      else if (at === null) cmp = 1; // nulls last
      else if (bt === null) cmp = -1;
      else cmp = new Date(at).getTime() - new Date(bt).getTime();
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return copy;
}

export default function PromptEvalsPage() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  useEffect(() => {
    fetch('/api/admin/prompts')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setPrompts(d.data ?? []);
        else setErr(d.message ?? 'Failed to load');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prompt Evals</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Leaderboard of all registered prompts and their latest evaluation results.
          </p>
        </div>
        <Link
          href="/admin/prompts/cost"
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <span className="material-icons text-base leading-none">attach_money</span>
          Cost view
        </Link>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {err}
        </div>
      )}

      {!loading && prompts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} registered
          {' · '}
          {prompts.filter((p) => p.latestRun != null).length} with runs
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
        </div>
      ) : prompts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">
          <span className="material-icons text-4xl text-muted-foreground/50 block mb-2">quiz</span>
          No prompts registered yet.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('title')}
                      className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
                    >
                      Prompt
                      {sortKey === 'title' && (
                        <span className="material-icons text-sm leading-none">
                          {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Active Ver.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('passRate')}
                      className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
                    >
                      Pass Rate
                      {sortKey === 'passRate' && (
                        <span className="material-icons text-sm leading-none">
                          {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Trend
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Last Run Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('lastRun')}
                      className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
                    >
                      Last Run
                      {sortKey === 'lastRun' && (
                        <span className="material-icons text-sm leading-none">
                          {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedPrompts(prompts, sortKey, sortDir).map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 align-middle">
                      <Link href={`/admin/prompts/${p.id}`} className="block">
                        <div className="font-medium text-foreground">{p.title}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{p.key}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Link href={`/admin/prompts/${p.id}`} className="block">
                        {p.activeVersion != null ? (
                          <span className="text-xs font-mono text-foreground">v{p.activeVersion}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Link href={`/admin/prompts/${p.id}`} className="block">
                        {p.latestRun != null ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${passRateBadgeClass(p.latestRun.passRate)}`}
                          >
                            {Math.round(p.latestRun.passRate * 100)}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border bg-gray-100 text-gray-500 border-gray-200">
                            No run
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Link href={`/admin/prompts/${p.id}`} className="block">
                        <TrendIcon trend={p.trend} />
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Link href={`/admin/prompts/${p.id}`} className="block">
                        {p.latestRun != null ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${statusBadgeClass(p.latestRun.status)}`}
                          >
                            <span className="material-icons text-sm leading-none">
                              {statusIcon(p.latestRun.status)}
                            </span>
                            {p.latestRun.status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                      <Link href={`/admin/prompts/${p.id}`} className="block">
                        {p.latestRun != null ? fmtAge(p.latestRun.createdAt) : '—'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
