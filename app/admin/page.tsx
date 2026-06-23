'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';
import { fetchJsonSafe } from '@/lib/admin/fetch-json-safe';
import { PageHeader, Button, Stat, Panel, Badge, StatusDot, BarChart, EmptyState, type Tone } from '@/components/admin/ui';

interface DashboardData {
  clients: { total: number; active: number };
  websites: { total: number; active: number };
  tickets: { open: number };
  projects: { active: number };
  invoices: { outstanding: number; collected: number; overdueCount: number; totalCount: number };
  subscriptions: { active: number; mrr: number };
  aiCredits: { totalBalance: number; totalMonthlyGrant: number };
  deals: { open: number; won: number; pipelineValue: number; wonValue: number };
  contacts: number;
  proposals: { draft: number; sent: number; accepted: number };
  campaigns: number;
  bookings: { pages: number; upcoming: number };
  automations: number;
  hostedSites: number;
  recent: {
    tickets: Array<{ id: number; number: number; subject: string; status: string; priority: string; createdAt: string }>;
    invoices: Array<{ id: number; number: string; status: string; total: number; createdAt: string }>;
    orders: Array<{ id: number; orderNumber: string; customerName: string; total: number; status: string; createdAt: string }>;
  };
  trends: { months: string[]; revenue: number[]; clients: number[]; tickets: number[] };
}

interface HealthJob {
  name: string; label: string; area: string;
  lastRunAt: string | null; lastSuccessAt: string | null;
  lastError: string | null; lastErrorAt: string | null; runCount: number;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString();

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  return fmtDate(iso);
}

function Delta({ series, goodUp = true }: { series: number[]; goodUp?: boolean }) {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (prev === 0 && last === 0) return null;
  const pct = prev === 0 ? 100 : Math.round(((last - prev) / prev) * 100);
  const up = last >= prev;
  const tone = pct === 0 ? 'text-muted-foreground' : up === goodUp ? 'text-[var(--admin-ok)]' : 'text-[var(--admin-bad)]';
  return <span className={`font-mono ${tone}`}>{up ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

const healthTone = (j: HealthJob): Tone => (j.lastError ? 'bad' : j.lastSuccessAt ? 'ok' : 'neutral');

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const [dash, hp] = await Promise.all([
      fetchJsonSafe<{ success: boolean; data: DashboardData }>('/api/admin/dashboard'),
      fetchJsonSafe<{ success: boolean; data: HealthJob[] }>('/api/admin/system-health'),
    ]);
    if (dash.ok && dash.data.success) setData(dash.data.data);
    else setFetchError(dash.ok ? 'Server returned an error.' : dash.error);
    setHealth(hp.ok && hp.data.success ? hp.data.data : null);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch dashboard data on mount
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  if (loading) return <DashboardSkeleton />;

  if (fetchError || !data) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="border border-border rounded-[7px] bg-card mt-6">
          <EmptyState
            icon="cloud_off"
            tone="bad"
            title="Couldn’t load dashboard"
            message={fetchError ?? 'The request failed. Retry, or check system health if it persists.'}
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" icon="refresh" onClick={() => void loadDashboard()}>Retry</Button>
                <Button href="/admin/system-health">System health</Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  // Merge the recent per-type rows into one time-sorted activity feed.
  type Act = { id: string; ts: number; iso: string; icon: string; href?: string; node: ReactNode };
  const activity: Act[] = [
    ...data.recent.tickets.map((t): Act => ({
      id: `t${t.id}`, ts: +new Date(t.createdAt), iso: t.createdAt, icon: 'support_agent',
      href: `/portal/tickets/${t.id}`, node: <><span className="font-mono text-muted-foreground">#{t.number}</span> {t.subject}</>,
    })),
    ...data.recent.invoices.map((inv): Act => ({
      id: `i${inv.id}`, ts: +new Date(inv.createdAt), iso: inv.createdAt, icon: 'receipt_long',
      href: `/portal/invoices/${inv.id}`, node: <>Invoice <b className="text-foreground">{inv.number}</b> · <span className="font-mono">{formatCents(inv.total)}</span></>,
    })),
    ...data.recent.orders.map((o): Act => ({
      id: `o${o.id}`, ts: +new Date(o.createdAt), iso: o.createdAt, icon: 'shopping_bag',
      node: <>Order <b className="text-foreground font-mono">{o.orderNumber}</b> · <span className="font-mono">{formatCents(o.total)}</span></>,
    })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 8);

  const okJobs = health?.filter((j) => healthTone(j) === 'ok').length ?? 0;
  const anyBad = health?.some((j) => healthTone(j) === 'bad') ?? false;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Dashboard" subtitle={`${data.clients.active} active clients · ${data.tickets.open} open tickets`}>
        <Button href="/admin/clients" variant="primary" icon="add">New client</Button>
      </PageHeader>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon="trending_up" label="Monthly recurring revenue" value={formatCents(data.subscriptions.mrr)} sub={`${data.subscriptions.active} active subscriptions`} href="/admin/subscriptions" />
        <Stat icon="account_balance_wallet" label="Outstanding" value={formatCents(data.invoices.outstanding)} sub={`${data.invoices.overdueCount} overdue`} href="/admin/portal-invoices" />
        <Stat
          icon="payments" label="Collected (12 mo)"
          value={formatCents(data.trends.revenue.reduce((a, b) => a + b, 0))}
          trend={data.trends.revenue}
          sub={<><Delta series={data.trends.revenue} /> · last month</>}
          href="/admin/portal-invoices"
        />
        <Stat icon="handshake" label="Pipeline value" value={formatCents(data.deals.pipelineValue)} sub={`${data.deals.open} open deals`} href="/admin/crm/deals" />
      </div>

      {/* Revenue chart */}
      <div className="mt-3">
        <Panel title="Revenue" icon="bar_chart" action={{ label: 'Invoices', href: '/admin/portal-invoices' }}>
          <div className="px-4 pt-3 text-xs text-muted-foreground">Paid invoices · last 12 months</div>
          <BarChart values={data.trends.revenue} labels={data.trends.months} format={formatCents} />
        </Panel>
      </div>

      {/* Operations */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        <Stat size="sm" icon="business" label="Clients" value={data.clients.active} trend={data.trends.clients} sub={<><Delta series={data.trends.clients} /> · {data.clients.total} total</>} href="/admin/clients" />
        <Stat size="sm" icon="language" label="Websites" value={data.websites.active} sub={`${data.websites.total} total`} href="/admin/portal-websites" />
        <Stat size="sm" icon="support_agent" label="Open tickets" value={data.tickets.open} tone={data.tickets.open > 0 ? 'bad' : undefined} trend={data.trends.tickets} sub={<><Delta series={data.trends.tickets} goodUp={false} /> · new/mo</>} href="/admin/portal-tickets" />
        <Stat size="sm" icon="view_kanban" label="Active projects" value={data.projects.active} href="/admin/portal-projects" />
        <Stat size="sm" icon="contacts" label="CRM contacts" value={data.contacts} href="/admin/crm/contacts" />
        <Stat size="sm" icon="cloud" label="Hosted sites" value={data.hostedSites} href="/admin/portal-hosting" />
      </div>

      {/* Services */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        <Stat size="sm" icon="campaign" label="Campaigns" value={data.campaigns} href="/admin/email" />
        <Stat size="sm" icon="calendar_month" label="Upcoming bookings" value={data.bookings.upcoming} sub={`${data.bookings.pages} pages`} href="/admin/booking" />
        <Stat size="sm" icon="bolt" label="Automations" value={data.automations} sub="active rules" href="/admin/automations" />
        <Stat size="sm" icon="token" label="AI credits" value={data.aiCredits.totalBalance.toLocaleString()} sub="pool balance" href="/admin/ai-credits" />
        <Stat size="sm" icon="description" label="Proposals" value={data.proposals.sent} sub={`${data.proposals.accepted} accepted`} href="/admin/crm/proposals" />
        <Stat size="sm" icon="shopping_cart" label="Won deals" value={data.deals.won} sub={formatCents(data.deals.wonValue)} href="/admin/portal-ecommerce" />
      </div>

      {/* Activity + System health */}
      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <div className="lg:col-span-2">
          <Panel title="Recent activity" icon="history" action={{ label: 'Tickets', href: '/admin/portal-tickets' }}>
            {activity.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">No recent activity</div>
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--admin-hover)] transition-colors">
                    <span className="w-7 h-7 rounded-md border border-border grid place-items-center text-muted-foreground shrink-0">
                      <span className="material-icons text-[15px]">{a.icon}</span>
                    </span>
                    <div className="min-w-0 flex-1 text-[13px] truncate">
                      {a.href ? <Link href={a.href} className="hover:text-[var(--admin-accent)] transition-colors">{a.node}</Link> : a.node}
                    </div>
                    <time className="font-mono text-[11px] text-muted-foreground shrink-0">{timeAgo(a.iso)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="System health"
          icon="monitor_heart"
          action={{ label: 'Details', href: '/admin/system-health' }}
        >
          {health === null ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Health unavailable</div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                <Badge tone={anyBad ? 'bad' : 'ok'}><StatusDot tone={anyBad ? 'bad' : 'ok'} /> {anyBad ? 'Degraded' : 'Operational'}</Badge>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{okJobs}/{health.length} ok</span>
              </div>
              <ul className="divide-y divide-border">
                {[...health].sort((a, b) => Number(!!b.lastError) - Number(!!a.lastError)).slice(0, 6).map((j) => (
                  <li key={j.name} className="px-4 py-2.5 flex items-center gap-2.5 text-[13px]">
                    <StatusDot tone={healthTone(j)} />
                    <span className="text-foreground truncate">{j.label || j.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground shrink-0">{j.lastRunAt ? timeAgo(j.lastRunAt) : 'never'}</span>
                  </li>
                ))}
              </ul>
              {health.length > 6 && (
                <Link href="/admin/system-health" className="block px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">+{health.length - 6} more jobs</Link>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* Quick actions */}
      <div className="mt-3">
        <Panel title="Quick actions">
          <div className="p-3 flex flex-wrap gap-2">
            <Button size="sm" href="/admin/clients" icon="person_add">Add client</Button>
            <Button size="sm" href="/admin/portal-invoices/new" icon="receipt">New invoice</Button>
            <Button size="sm" href="/admin/portal-projects" icon="add_task">New project</Button>
            <Button size="sm" href="/admin/portal-tickets" icon="support">View tickets</Button>
            <Button size="sm" href="/admin/email/campaigns/new" icon="drafts">New campaign</Button>
            <Button size="sm" href="/admin/crm/deals" icon="trending_up">View deals</Button>
            <Button size="sm" href="/admin/mcp-usage" icon="query_stats">MCP usage</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const block = 'rounded-[7px] border border-border bg-[var(--admin-surface-2)]';
  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-40 rounded bg-[var(--admin-surface-2)]" />
        <div className="h-[34px] w-28 rounded bg-[var(--admin-surface-2)]" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${block} h-[92px]`} />)}
      </div>
      <div className={`${block} h-44 mt-3`} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${block} h-[74px]`} />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <div className={`${block} h-64 lg:col-span-2`} />
        <div className={`${block} h-64`} />
      </div>
    </div>
  );
}
