'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricWithChange {
  value: number;
  change: number | null;
}

interface TimeseriesPoint {
  date: string;
  pageViews: number;
  users: number;
}

interface TopPage {
  path: string;
  pageViews: number;
  users: number;
  avgDuration: number;
}

interface TrafficSource {
  channel: string;
  sessions: number;
  users: number;
}

interface AnalyticsReport {
  range: number;
  metrics: {
    users: MetricWithChange;
    sessions: MetricWithChange;
    pageViews: MetricWithChange;
    bounceRate: MetricWithChange;
    avgSessionDuration: MetricWithChange;
    engagementRate: MetricWithChange;
  };
  timeseries: TimeseriesPoint[];
  topPages: TopPage[];
  trafficSources: TrafficSource[];
}

// ─── Sparkline SVG ──────────────────────────────────────────────────────────

function Sparkline({
  data,
  width = 280,
  height = 60,
  color = 'var(--primary)',
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const fillPoints = [
    `${padding},${height - padding}`,
    ...points,
    `${width - padding},${height - padding}`,
  ];

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Fill area */}
      <polygon
        points={fillPoints.join(' ')}
        fill={color}
        fillOpacity={0.08}
      />
      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr: string): string {
  // dateStr is "YYYYMMDD"
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const CHANNEL_ICONS: Record<string, string> = {
  'Organic Search': 'search',
  'Direct': 'open_in_browser',
  'Referral': 'link',
  'Organic Social': 'group',
  'Paid Search': 'paid',
  'Email': 'email',
  'Paid Social': 'campaign',
  'Display': 'ad_units',
  'Unassigned': 'help_outline',
};

const CHANNEL_COLORS: Record<string, string> = {
  'Organic Search': '#22c55e',
  'Direct': '#3b82f6',
  'Referral': '#a855f7',
  'Organic Social': '#f59e0b',
  'Paid Search': '#ef4444',
  'Email': '#06b6d4',
  'Paid Social': '#ec4899',
  'Display': '#f97316',
};

// ─── Metric Card ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  change,
  icon,
  format = 'number',
}: {
  label: string;
  value: number;
  change: number | null;
  icon: string;
  format?: 'number' | 'percent' | 'duration';
}) {
  const displayValue =
    format === 'percent' ? `${value}%` :
    format === 'duration' ? formatDuration(value) :
    formatNumber(value);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="material-icons text-sm">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-foreground">{displayValue}</span>
        {change !== null && (
          <span
            className={`text-xs font-medium mb-1 ${
              change > 0 ? 'text-green-600' : change < 0 ? 'text-red-500' : 'text-muted-foreground'
            }`}
          >
            {change > 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function GaAnalyticsDashboard({
  siteId,
  propertyId,
  measurementId,
}: {
  siteId: number;
  propertyId: string;
  measurementId: string | null;
}) {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(30);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/portal/websites/${siteId}/google/analytics/report?range=${range}`,
      );
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
      } else {
        setError(json.message || 'Failed to load analytics');
      }
    } catch {
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [siteId, range]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="space-y-5">
      {/* Header row: property info + date range picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons text-green-600 text-base">check_circle</span>
          <span className="text-sm text-foreground font-medium">{propertyId.replace('properties/', 'Property ')}</span>
          {measurementId && (
            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
              {measurementId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                range === d
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          <span className="material-icons text-base animate-spin">refresh</span>
          <span className="text-sm">Loading analytics...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-center gap-2 py-6 justify-center">
          <span className="material-icons text-red-500 text-base">error_outline</span>
          <span className="text-sm text-red-600">{error}</span>
          <button
            onClick={fetchReport}
            className="text-xs text-primary hover:underline ml-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* Report data */}
      {report && !loading && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard
              label="Users"
              value={report.metrics.users.value}
              change={report.metrics.users.change}
              icon="person"
            />
            <MetricCard
              label="Sessions"
              value={report.metrics.sessions.value}
              change={report.metrics.sessions.change}
              icon="ads_click"
            />
            <MetricCard
              label="Page Views"
              value={report.metrics.pageViews.value}
              change={report.metrics.pageViews.change}
              icon="visibility"
            />
            <MetricCard
              label="Bounce Rate"
              value={report.metrics.bounceRate.value}
              change={report.metrics.bounceRate.change}
              icon="trending_down"
              format="percent"
            />
            <MetricCard
              label="Avg. Duration"
              value={report.metrics.avgSessionDuration.value}
              change={report.metrics.avgSessionDuration.change}
              icon="schedule"
              format="duration"
            />
            <MetricCard
              label="Engagement"
              value={report.metrics.engagementRate.value}
              change={report.metrics.engagementRate.change}
              icon="favorite"
              format="percent"
            />
          </div>

          {/* Timeseries sparklines */}
          {report.timeseries.length > 1 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-6 mb-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-0.5 rounded bg-primary" />
                  <span className="text-xs text-muted-foreground">Page Views</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-0.5 rounded bg-blue-500" />
                  <span className="text-xs text-muted-foreground">Users</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Sparkline
                  data={report.timeseries.map((t) => t.pageViews)}
                  width={600}
                  height={50}
                  color="var(--primary)"
                />
                <Sparkline
                  data={report.timeseries.map((t) => t.users)}
                  width={600}
                  height={40}
                  color="#3b82f6"
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>{formatDate(report.timeseries[0].date)}</span>
                <span>{formatDate(report.timeseries[report.timeseries.length - 1].date)}</span>
              </div>
            </div>
          )}

          {/* Top Pages + Traffic Sources side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Pages */}
            {report.topPages.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="material-icons text-muted-foreground text-sm">article</span>
                  Top Pages
                </h4>
                <div className="space-y-1.5">
                  {report.topPages.map((page) => (
                    <div
                      key={page.path}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0"
                    >
                      <span
                        className="text-foreground truncate max-w-[200px] font-mono"
                        title={page.path}
                      >
                        {page.path}
                      </span>
                      <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                        <span>{formatNumber(page.pageViews)} views</span>
                        <span>{formatNumber(page.users)} users</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Traffic Sources */}
            {report.trafficSources.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="material-icons text-muted-foreground text-sm">traffic</span>
                  Traffic Sources
                </h4>
                <div className="space-y-2">
                  {report.trafficSources.map((source) => {
                    const totalSessions = report.trafficSources.reduce(
                      (sum, s) => sum + s.sessions,
                      0,
                    );
                    const pct = totalSessions > 0
                      ? Math.round((source.sessions / totalSessions) * 100)
                      : 0;
                    const color = CHANNEL_COLORS[source.channel] || '#6b7280';
                    const icon = CHANNEL_ICONS[source.channel] || 'language';

                    return (
                      <div key={source.channel} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="material-icons text-xs"
                              style={{ color }}
                            >
                              {icon}
                            </span>
                            <span className="text-foreground">{source.channel}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {formatNumber(source.sessions)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Link to full GA */}
          <div className="text-center">
            <a
              href={`https://analytics.google.com/analytics/web/#/${propertyId.replace('properties/', 'p')}/reports/reportinghub`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="material-icons text-xs">open_in_new</span>
              View full report in Google Analytics
            </a>
          </div>
        </>
      )}
    </div>
  );
}
