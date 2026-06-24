'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PromptCostRow {
  id: number;
  key: string;
  title: string;
  runs: number;
  tokens: number;
  costUsd: number;
  lastRunAt: string | null;
}

interface CostTotals {
  runs: number;
  tokens: number;
  costUsd: number;
}

interface CostData {
  totals: CostTotals;
  perPrompt: PromptCostRow[];
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

export default function EvalCostPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/eval-cost')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d.data ?? null);
        else setErr(d.message ?? 'Failed to load');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/admin/prompts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base leading-none">arrow_back</span>
          Prompt Evals
        </Link>
      </div>

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Eval Cost &amp; Spend</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Token usage and cost aggregated across all evaluation runs, per prompt.
        </p>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
        </div>
      ) : data == null ? null : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                <span className="material-icons text-base leading-none">play_circle</span>
                Total Runs
              </div>
              <div className="text-3xl font-bold text-foreground">
                {data.totals.runs.toLocaleString()}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                <span className="material-icons text-base leading-none">token</span>
                Total Tokens
              </div>
              <div className="text-3xl font-bold text-foreground">
                {data.totals.tokens.toLocaleString()}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                <span className="material-icons text-base leading-none">attach_money</span>
                Total Cost
              </div>
              <div className="text-3xl font-bold text-foreground">
                ${data.totals.costUsd.toFixed(4)}
              </div>
            </div>
          </div>

          {/* Per-prompt table */}
          {data.perPrompt.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">
              <span className="material-icons text-4xl text-muted-foreground/50 block mb-2">
                receipt_long
              </span>
              No eval runs recorded yet.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Prompt
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Runs
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Tokens
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Cost (USD)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Last Run
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.perPrompt.map((row) => (
                      <tr key={row.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3 align-middle">
                          <Link href={`/admin/prompts/${row.id}`} className="block">
                            <div className="font-medium text-foreground">{row.title}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              {row.key}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 align-middle text-foreground">
                          {row.runs.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 align-middle text-foreground">
                          {row.tokens.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 align-middle font-mono text-foreground">
                          ${row.costUsd.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                          {fmtAge(row.lastRunAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
