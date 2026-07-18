'use client';

import { useState, useEffect } from 'react';

interface Summary {
  windowDays: number;
  totalCalls: number;
  totalTokens: number;
  totalErrors: number;
  estimatedCostUsd: number;
  errorRate: number;
}

interface TodaySoFar {
  calls: number;
  tokens: number;
  errors: number;
  estimatedCostUsd: number;
}

interface TopClient {
  clientId: number;
  company: string | null;
  clientName: string | null;
  totalCalls: number;
  totalTokens: number;
  estimatedCostUsd: number;
  errorCount: number;
}

interface TopTool {
  toolName: string;
  totalCalls: number;
  totalTokens: number;
  avgTokensPerCall: number;
  p95Tokens: number;
  maxResponseBytes: number;
  errorCount: number;
  truncationRisk: boolean;
}

interface RecentError {
  id: number;
  toolName: string;
  clientId: number;
  company: string | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
}

interface SlowTool {
  toolName: string;
  p95DurationMs: number;
  totalCalls: number;
}

interface DailyPoint {
  day: string;
  calls: number;
  tokens: number;
  errors: number;
  estimatedCostUsd: number;
}

interface Payload {
  windowDays: number;
  costPerMTokUsd: number;
  summary: Summary;
  todaySoFar: TodaySoFar;
  topClients: TopClient[];
  topTools: TopTool[];
  recentErrors: RecentError[];
  slowTools: SlowTool[];
  dailySeries: DailyPoint[];
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

function formatUsd(n: number) {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatBytes(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const WINDOWS = [1, 7, 14, 30] as const;
type Window = typeof WINDOWS[number];

export default function AdminMcpUsagePage() {
  const [days, setDays] = useState<Window>(7);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/portal/mcp-usage?days=${days}`)
      .then(r => r.json())
      .then(d => {
        if (d?.data) setData(d.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">MCP Usage</h1>
          <p className="text-muted-foreground mt-1">
            Per-tool, per-client telemetry from the portal MCP server. Token costs are estimates
            (~3 chars/token for JSON; reconciliation against count_tokens API arrives in Round 4a).
          </p>
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                days === w ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin text-3xl">progress_activity</span>
          <p className="mt-2">Loading MCP usage…</p>
        </div>
      ) : (
        <>
          {/* Summary cards: window total + today so-far */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Total calls</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatNumber(data.summary.totalCalls)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">last {data.summary.windowDays}d</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Estimated tokens</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatTokens(data.summary.totalTokens)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">@ {data.costPerMTokUsd.toFixed(2)}/MTok input</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Estimated cost</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(data.summary.estimatedCostUsd)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">last {data.summary.windowDays}d</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Error rate</p>
              <p className={`text-2xl font-bold mt-1 ${data.summary.errorRate > 0.05 ? 'text-red-600' : 'text-foreground'}`}>
                {(data.summary.errorRate * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatNumber(data.summary.totalErrors)} errored</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Today so far</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatNumber(data.todaySoFar.calls)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTokens(data.todaySoFar.tokens)} tok · {formatUsd(data.todaySoFar.estimatedCostUsd)}
              </p>
            </div>
          </div>

          {/* Daily sparkline (text-only — no chart lib in repo) */}
          {data.dailySeries.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-semibold text-foreground mb-3">Daily totals</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left">
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pr-6 pb-2">Day</th>
                      <th className="pr-6 pb-2">Calls</th>
                      <th className="pr-6 pb-2">Tokens</th>
                      <th className="pr-6 pb-2">Errors</th>
                      <th className="pb-2">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.dailySeries.map(d => (
                      <tr key={d.day}>
                        <td className="py-2 pr-6 text-muted-foreground">{d.day}</td>
                        <td className="py-2 pr-6 text-foreground">{formatNumber(d.calls)}</td>
                        <td className="py-2 pr-6 text-foreground">{formatTokens(d.tokens)}</td>
                        <td className={`py-2 pr-6 ${d.errors > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {formatNumber(d.errors)}
                        </td>
                        <td className="py-2 text-muted-foreground">{formatUsd(d.estimatedCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Top clients */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-foreground">Top clients by tokens</h2>
              </div>
              {data.topClients.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No data yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Calls</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tokens</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Est. cost</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.topClients.map(c => (
                      <tr key={c.clientId} className="hover:bg-accent/50">
                        <td className="px-4 py-3 font-medium text-foreground">{c.company ?? c.clientName ?? `#${c.clientId}`}</td>
                        <td className="px-4 py-3 text-foreground">{formatNumber(c.totalCalls)}</td>
                        <td className="px-4 py-3 text-foreground">{formatTokens(c.totalTokens)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatUsd(c.estimatedCostUsd)}</td>
                        <td className={`px-4 py-3 ${c.errorCount > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {c.errorCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top tools */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-foreground">Top tools by tokens</h2>
              </div>
              {data.topTools.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No data yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tool</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Calls</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg tok</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">p95 tok</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.topTools.map(t => (
                      <tr key={t.toolName} className="hover:bg-accent/50">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">
                          {t.toolName}
                          {t.truncationRisk && (
                            <span
                              className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700"
                              title="At least one response exceeded ~25k tokens — Claude Code silently truncates above that"
                            >
                              TRUNC
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatNumber(t.totalCalls)}</td>
                        <td className="px-4 py-3 text-foreground">{formatTokens(t.avgTokensPerCall)}</td>
                        <td className="px-4 py-3 text-foreground">{formatTokens(t.p95Tokens)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatBytes(t.maxResponseBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Slow tools */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-foreground">Slowest tools (p95 duration)</h2>
              </div>
              {data.slowTools.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No data yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tool</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">p95</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Calls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.slowTools.map(t => (
                      <tr key={t.toolName} className="hover:bg-accent/50">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{t.toolName}</td>
                        <td className={`px-4 py-3 ${t.p95DurationMs > 1000 ? 'text-orange-600' : 'text-foreground'}`}>
                          {t.p95DurationMs} ms
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatNumber(t.totalCalls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Recent errors */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-foreground">Recent errors</h2>
              </div>
              {data.recentErrors.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No errors recorded.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">When</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tool</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.recentErrors.map(e => (
                      <tr key={e.id} className="hover:bg-accent/50">
                        <td className="px-4 py-3 text-muted-foreground text-xs">{relativeTime(e.createdAt)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{e.toolName}</td>
                        <td className="px-4 py-3 text-foreground">{e.company ?? `#${e.clientId}`}</td>
                        <td className="px-4 py-3 text-red-600 text-xs truncate max-w-xs" title={e.errorMessage ?? ''}>
                          {e.errorMessage ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
