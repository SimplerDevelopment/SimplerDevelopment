'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// --- Types ---

interface DashboardData {
  totalContacts: number;
  totalCompanies: number;
  openDealsValue: number;
  wonDealsValue: number;
  recentActivities: Activity[];
}

interface Activity {
  id: number;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
}

interface WinLoss { won: number; lost: number; open: number; }
interface RevenueMonth { month: string; won_value: number; won_count: number; }
interface FunnelStage { stage_name: string; color: string; sort_order: number; deal_count: number; total_value: number; }
interface ActivityCount { type: string; count: number; }
interface TopDeal { id: number; title: string; value: number | null; status: string; }

interface AnalyticsData {
  winLoss: WinLoss;
  revenueByMonth: RevenueMonth[];
  pipelineFunnel: FunnelStage[];
  avgDaysToClose: number | null;
  activitySummary: ActivityCount[];
  topDeals: TopDeal[];
  mrr: number;
  arr: number;
}

// --- Helpers ---

const activityIcons: Record<string, string> = {
  call: 'phone', email: 'mail', meeting: 'groups', note: 'sticky_note_2', task: 'task_alt',
  deal_created: 'add_circle', deal_won: 'emoji_events', deal_lost: 'cancel',
  contact_created: 'person_add', stage_change: 'swap_horiz',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

function formatCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// --- SVG Chart Components ---

function DonutChart({ won, lost, open }: { won: number; lost: number; open: number }) {
  const total = won + lost + open;
  if (total === 0) return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No deal data yet</div>;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { dash: (won / total) * circumference, color: '#22c55e', label: 'Won', count: won, pct: won / total },
    { dash: (lost / total) * circumference, color: '#ef4444', label: 'Lost', count: lost, pct: lost / total },
    { dash: (open / total) * circumference, color: '#3b82f6', label: 'Open', count: open, pct: open / total },
  ];
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        {segments.map((seg) => {
          const o = offset;
          offset -= seg.dash;
          return <circle key={seg.label} cx="60" cy="60" r={radius} fill="none" stroke={seg.color} strokeWidth="16" strokeDasharray={`${seg.dash} ${circumference - seg.dash}`} strokeDashoffset={o} transform="rotate(-90 60 60)" className="transition-all duration-700" />;
        })}
        <text x="60" y="56" textAnchor="middle" className="fill-foreground text-xl font-bold" fontSize="20">{total}</text>
        <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Deals</text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs text-foreground font-medium">{seg.label}</span>
            <span className="text-xs text-muted-foreground">{seg.count} ({(seg.pct * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data }: { data: RevenueMonth[] }) {
  if (data.length === 0) return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No revenue data yet</div>;

  const values = data.map((d) => Number(d.won_value));
  const maxVal = Math.max(...values, 1);
  const chartW = 500, chartH = 160, padX = 40, padY = 16;
  const plotW = chartW - padX * 2, plotH = chartH - padY * 2;

  const points = data.map((d, i) => ({
    x: padX + (i / Math.max(data.length - 1, 1)) * plotW,
    y: padY + plotH - (Number(d.won_value) / maxVal) * plotH,
    ...d,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = [`${points[0].x},${padY + plotH}`, ...points.map((p) => `${p.x},${p.y}`), `${points[points.length - 1].x},${padY + plotH}`].join(' ');

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-40" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((pct) => {
        const y = padY + plotH - pct * plotH;
        return <g key={pct}><line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="currentColor" className="text-border" strokeWidth="0.5" /><text x={padX - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize="7">{formatCompact(maxVal * pct)}</text></g>;
      })}
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" /><stop offset="100%" stopColor="#22c55e" stopOpacity="0" /></linearGradient></defs>
      <polygon points={area} fill="url(#lg)" opacity="0.2" />
      <polyline points={polyline} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r="2.5" fill="#22c55e" /><text x={p.x} y={padY + plotH + 12} textAnchor="middle" className="fill-muted-foreground" fontSize="6">{p.month.slice(5)}</text></g>)}
    </svg>
  );
}

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No pipeline data</div>;
  const maxValue = Math.max(...stages.map((s) => Number(s.total_value)), 1);

  return (
    <div className="space-y-2.5">
      {stages.map((stage) => (
        <div key={stage.stage_name} className="space-y-0.5">
          <div className="flex justify-between text-xs">
            <span className="text-foreground font-medium">{stage.stage_name}</span>
            <span className="text-muted-foreground">{Number(stage.deal_count)} deals &middot; {formatCurrency(Number(stage.total_value))}</span>
          </div>
          <div className="w-full bg-accent rounded-full h-4 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max((Number(stage.total_value) / maxValue) * 100, 2)}%`, backgroundColor: stage.color || '#6366f1' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Main Page ---

export default function CrmDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('12m');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      fetch('/api/portal/crm/dashboard').then(r => { if (!r.ok) throw new Error('Dashboard failed'); return r.json(); }),
      fetch(`/api/portal/crm/analytics?period=${period}`).then(r => { if (!r.ok) throw new Error('Analytics failed'); return r.json(); }),
    ]).then(([d, a]) => {
      setDashboard(d.data ?? null);
      setAnalytics(a.data ?? null);
      setLoading(false);
    }).catch((err) => { setError(err.message || 'Failed to load dashboard'); setLoading(false); });
  }, [period]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><span className="material-icons animate-spin text-primary text-2xl">refresh</span></div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <span className="material-icons text-3xl text-destructive">error</span>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={() => setPeriod(p => p)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">Retry</button>
      </div>
    );
  }

  const wl = analytics?.winLoss;
  const totalDecided = (Number(wl?.won ?? 0)) + (Number(wl?.lost ?? 0));
  const winRate = totalDecided > 0 ? ((Number(wl?.won ?? 0) / totalDecided) * 100).toFixed(0) : '--';
  const openPipelineValue = analytics?.pipelineFunnel?.reduce((s, f) => s + Number(f.total_value), 0) ?? 0;

  const periods = [
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: '12m', label: '12M' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Sales performance and pipeline health</p>
        </div>
        <div className="flex items-center gap-1 bg-accent rounded-lg p-1">
          {periods.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)} className={`px-3 py-1.5 text-xs rounded-md transition-colors ${period === p.value ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Contacts', value: dashboard?.totalContacts ?? 0, icon: 'people', color: 'text-blue-500', href: '/portal/crm/contacts' },
          { label: 'Companies', value: dashboard?.totalCompanies ?? 0, icon: 'business', color: 'text-purple-500', href: '/portal/crm/companies' },
          { label: 'Win Rate', value: winRate === '--' ? '--' : `${winRate}%`, icon: 'emoji_events', color: 'text-green-500' },
          { label: 'Open Pipeline', value: formatCurrency(openPipelineValue), icon: 'trending_up', color: 'text-orange-500', href: '/portal/crm/deals' },
          { label: 'MRR', value: formatCurrency(analytics?.mrr ?? 0), subtitle: `ARR: ${formatCurrency(analytics?.arr ?? 0)}`, icon: 'autorenew', color: 'text-emerald-500' },
          { label: 'Avg Close', value: analytics?.avgDaysToClose != null ? `${analytics.avgDaysToClose}d` : '--', icon: 'schedule', color: 'text-cyan-500' },
        ].map((s) => {
          const content = (
            <>
              <span className={`material-icons text-lg ${s.color}`}>{s.icon}</span>
              <p className="mt-2 text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              {'subtitle' in s && s.subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{s.subtitle}</p>}
            </>
          );
          return (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4 group">
              {'href' in s && s.href ? <Link href={s.href as string} className="block">{content}</Link> : content}
            </div>
          );
        })}
      </div>

      {/* Charts Row: Revenue Trend + Win/Loss */}
      {analytics && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground text-sm mb-3">Revenue Trend</h2>
            <LineChart data={analytics.revenueByMonth} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground text-sm mb-3">Win / Loss</h2>
            <DonutChart won={Number(analytics.winLoss.won)} lost={Number(analytics.winLoss.lost)} open={Number(analytics.winLoss.open)} />
          </div>
        </div>
      )}

      {/* Pipeline Funnel + Recent Activity + Quick Actions */}
      <div className="grid lg:grid-cols-3 gap-4">
        {analytics && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground text-sm mb-3">Pipeline Funnel</h2>
            <FunnelChart stages={analytics.pipelineFunnel} />
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground text-sm mb-3">Recent Activity</h2>
          {(dashboard?.recentActivities ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No recent activity.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {(dashboard?.recentActivities ?? []).slice(0, 8).map(a => (
                <li key={a.id} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <span className="material-icons text-sm text-muted-foreground mt-0.5">{activityIcons[a.type] ?? 'circle'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{a.title}</p>
                    <span className="text-[10px] text-muted-foreground">{relativeTime(a.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground text-sm mb-3">Quick Actions</h2>
          <div className="space-y-2">
            <Link href="/portal/crm/contacts" className="flex items-center gap-2 w-full px-3 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
              <span className="material-icons text-sm">person_add</span>Add Contact
            </Link>
            <Link href="/portal/crm/deals" className="flex items-center gap-2 w-full px-3 py-2.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-accent transition-colors">
              <span className="material-icons text-sm">add_circle</span>Create Deal
            </Link>
            <Link href="/portal/crm/companies" className="flex items-center gap-2 w-full px-3 py-2.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-accent transition-colors">
              <span className="material-icons text-sm">domain_add</span>Add Company
            </Link>
            <Link href="/portal/crm/proposals" className="flex items-center gap-2 w-full px-3 py-2.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-accent transition-colors">
              <span className="material-icons text-sm">description</span>New Proposal
            </Link>
          </div>
        </div>
      </div>

      {/* Top Deals Table */}
      {analytics && analytics.topDeals.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground text-sm mb-3">Top Open Deals</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 text-xs text-muted-foreground font-medium">Deal</th>
                  <th className="pb-2 text-xs text-muted-foreground font-medium text-right">Value</th>
                  <th className="pb-2 text-xs text-muted-foreground font-medium text-right" />
                </tr>
              </thead>
              <tbody>
                {analytics.topDeals.map((deal) => (
                  <tr key={deal.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 text-foreground font-medium text-sm">{deal.title}</td>
                    <td className="py-2.5 text-foreground text-right text-sm">{deal.value != null ? formatCurrency(Number(deal.value)) : '--'}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/portal/crm/deals?deal=${deal.id}`} className="text-primary hover:text-primary/80 text-xs font-medium">View</Link>
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
