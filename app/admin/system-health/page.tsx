'use client';

import { useEffect, useMemo, useState } from 'react';

interface JobRow {
  name: string;
  area: 'api-cron' | 'routine';
  label: string;
  schedule: string;
  purpose: string;
  tracked: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  runCount: number;
}

type StatusKind = 'green' | 'yellow' | 'red' | 'untracked' | 'never';

interface StatusVerdict {
  kind: StatusKind;
  label: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function classifyStatus(row: JobRow): StatusVerdict {
  if (!row.tracked) return { kind: 'untracked', label: 'External' };
  if (!row.lastRunAt) return { kind: 'never', label: 'Never run' };

  const lastRun = new Date(row.lastRunAt).getTime();
  const age = Date.now() - lastRun;
  const hasRecentError =
    row.lastError !== null &&
    row.lastErrorAt !== null &&
    Date.now() - new Date(row.lastErrorAt).getTime() < ONE_DAY_MS;

  if (hasRecentError) return { kind: 'red', label: 'Failing' };
  if (age > ONE_DAY_MS) return { kind: 'yellow', label: 'Stale' };
  if (row.lastError) return { kind: 'yellow', label: 'Recovered' };
  return { kind: 'green', label: 'Healthy' };
}

function statusBadgeClass(kind: StatusKind): string {
  switch (kind) {
    case 'green':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'yellow':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'red':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'never':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'untracked':
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}

function statusIcon(kind: StatusKind): string {
  switch (kind) {
    case 'green':
      return 'check_circle';
    case 'yellow':
      return 'warning';
    case 'red':
      return 'error';
    case 'never':
      return 'help_outline';
    case 'untracked':
    default:
      return 'cloud';
  }
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

const AREA_LABELS: Record<JobRow['area'], string> = {
  'api-cron': 'API Cron (Vercel)',
  'routine': 'Routines (GitHub Actions)',
};

const AREA_ICONS: Record<JobRow['area'], string> = {
  'api-cron': 'schedule',
  'routine': 'cloud',
};

const AREA_ORDER: JobRow['area'][] = ['api-cron', 'routine'];

export default function SystemHealthPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/system-health')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setJobs(d.data ?? []);
        else setErr(d.message ?? 'Failed to load');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const g: Record<JobRow['area'], JobRow[]> = {
      'api-cron': [],
      'routine': [],
    };
    for (const j of jobs) g[j.area].push(j);
    return g;
  }, [jobs]);

  const stats = useMemo(() => {
    const tracked = jobs.filter((j) => j.tracked);
    const greens = tracked.filter((j) => classifyStatus(j).kind === 'green').length;
    const yellows = tracked.filter((j) => classifyStatus(j).kind === 'yellow').length;
    const reds = tracked.filter((j) => classifyStatus(j).kind === 'red').length;
    const nevers = tracked.filter((j) => classifyStatus(j).kind === 'never').length;
    return { greens, yellows, reds, nevers, total: tracked.length };
  }, [jobs]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Health</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Status of every scheduled/recurring job in the platform. Read-only.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon="check_circle" label="Healthy" value={stats.greens} color="text-green-600" />
        <StatCard icon="warning" label="Stale / Recovered" value={stats.yellows} color={stats.yellows > 0 ? 'text-yellow-600' : undefined} />
        <StatCard icon="error" label="Failing" value={stats.reds} color={stats.reds > 0 ? 'text-red-600' : undefined} urgent={stats.reds > 0} />
        <StatCard icon="help_outline" label="Never Run" value={stats.nevers} />
        <StatCard icon="schedule" label="Total Tracked" value={stats.total} />
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
      ) : (
        AREA_ORDER.map((area) => {
          const list = grouped[area];
          if (list.length === 0) return null;
          return (
            <section key={area} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-icons text-muted-foreground text-lg">
                  {AREA_ICONS[area]}
                </span>
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  {AREA_LABELS[area]}
                </h2>
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Schedule</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Run</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Success</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {list.map((j) => {
                        const v = classifyStatus(j);
                        const isRed = v.kind === 'red';
                        return (
                          <tr key={j.name} className={`hover:bg-accent/50 transition-colors ${isRed ? 'bg-red-50/30' : ''}`}>
                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-foreground">{j.label}</div>
                              <div className="text-xs text-muted-foreground font-mono mt-0.5">{j.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{j.purpose}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <code className="text-xs text-muted-foreground">{j.schedule}</code>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-xs text-foreground">{fmtAge(j.lastRunAt)}</div>
                              {j.runCount > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {j.runCount} run{j.runCount === 1 ? '' : 's'}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                              {fmtAge(j.lastSuccessAt)}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${statusBadgeClass(v.kind)}`}>
                                <span className="material-icons text-sm leading-none">{statusIcon(v.kind)}</span>
                                {v.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top max-w-md">
                              {j.lastError ? (
                                <details>
                                  <summary className="cursor-pointer text-xs text-red-700 truncate">
                                    {j.lastError.slice(0, 100)}
                                    {j.lastError.length > 100 ? '…' : ''}
                                  </summary>
                                  <pre className="mt-2 text-[10px] text-red-900 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                                    {j.lastError}
                                  </pre>
                                  {j.lastErrorAt && (
                                    <div className="text-[10px] text-muted-foreground mt-1">
                                      at {new Date(j.lastErrorAt).toLocaleString()}
                                    </div>
                                  )}
                                </details>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })
      )}

      <div className="text-xs text-muted-foreground border-t border-border pt-4">
        <p>
          <strong>Status logic:</strong> green = last run &lt; 24h and no recent error.
          Yellow = stale (last run &gt; 24h) or recovered (last run was clean but a
          stale error message is still on file). Red = error logged in the last 24h.
        </p>
        <p className="mt-1">
          GitHub Actions routines and BRAIN-12 one-shots are not instrumented; check the
          workflow run history for their status.
        </p>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: string;
  label: string;
  value: number;
  color?: string;
  urgent?: boolean;
}

function StatCard({ icon, label, value, color, urgent }: StatCardProps) {
  return (
    <div className={`bg-card border border-border rounded-xl p-4 ${urgent ? 'ring-1 ring-red-300' : ''}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="material-icons text-base">{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${color ?? 'text-foreground'}`}>{value}</div>
    </div>
  );
}
