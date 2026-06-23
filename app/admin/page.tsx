'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCents, ticketStatusColor, priorityColor, invoiceStatusColor, orderStatusColor } from '@/lib/portal-utils';
import { fetchJsonSafe } from '@/lib/admin/fetch-json-safe';

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
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setFetchError(null);
    const result = await fetchJsonSafe<{ success: boolean; data: DashboardData }>('/api/admin/dashboard');
    if (result.ok && result.data.success) {
      setData(result.data.data);
    } else {
      setFetchError(result.ok ? 'Server returned an error.' : result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setFetchError(null);
      const result = await fetchJsonSafe<{ success: boolean; data: DashboardData }>('/api/admin/dashboard');
      if (result.ok && result.data.success) {
        setData(result.data.data);
      } else {
        setFetchError(result.ok ? 'Server returned an error.' : result.error);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh] p-6">
        <div className="bg-card border border-border rounded-lg p-8 max-w-md w-full space-y-4 text-center">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-destructive/10">
            <span className="material-icons text-destructive text-2xl">error_outline</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Failed to load dashboard</h2>
            {fetchError && (
              <p className="text-xs text-muted-foreground mt-1 font-mono">{fetchError}</p>
            )}
          </div>
          <button
            onClick={loadDashboard}
            className="flex items-center gap-2 mx-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">refresh</span>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">SimplerDevelopment SaaS Management</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/clients"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add</span>
            New Client
          </Link>
        </div>
      </div>

      {/* Revenue Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon="trending_up"
          iconColor="text-green-600"
          label="Monthly Recurring Revenue"
          value={formatCents(data.subscriptions.mrr)}
          sub={`${data.subscriptions.active} active subscriptions`}
          href="/admin/subscriptions"
        />
        <MetricCard
          icon="account_balance_wallet"
          iconColor="text-blue-600"
          label="Outstanding"
          value={formatCents(data.invoices.outstanding)}
          sub={`${data.invoices.overdueCount} overdue`}
          href="/admin/portal-invoices"
        />
        <MetricCard
          icon="payments"
          iconColor="text-emerald-600"
          label="Total Collected"
          value={formatCents(data.invoices.collected)}
          sub={`${data.invoices.totalCount} invoices`}
          href="/admin/portal-invoices"
        />
        <MetricCard
          icon="handshake"
          iconColor="text-purple-600"
          label="Pipeline Value"
          value={formatCents(data.deals.pipelineValue)}
          sub={`${data.deals.open} open deals`}
          href="/admin/crm/deals"
        />
      </div>

      {/* Operations Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MiniCard icon="business" label="Clients" value={data.clients.active} sub={`${data.clients.total} total`} href="/admin/clients" />
        <MiniCard icon="language" label="Websites" value={data.websites.active} sub={`${data.websites.total} total`} href="/admin/portal-websites" />
        <MiniCard icon="support_agent" label="Open Tickets" value={data.tickets.open} href="/admin/portal-tickets" urgent={data.tickets.open > 0} />
        <MiniCard icon="view_kanban" label="Active Projects" value={data.projects.active} href="/admin/portal-projects" />
        <MiniCard icon="contacts" label="CRM Contacts" value={data.contacts} href="/admin/crm/contacts" />
        <MiniCard icon="cloud" label="Hosted Sites" value={data.hostedSites} href="/admin/portal-hosting" />
      </div>

      {/* Services Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MiniCard icon="campaign" label="Campaigns" value={data.campaigns} href="/admin/email" />
        <MiniCard icon="calendar_month" label="Upcoming Bookings" value={data.bookings.upcoming} sub={`${data.bookings.pages} pages`} href="/admin/booking" />
        <MiniCard icon="bolt" label="Automations" value={data.automations} sub="active rules" href="/admin/automations" />
        <MiniCard icon="token" label="AI Credits" value={data.aiCredits.totalBalance.toLocaleString()} sub="pool balance" href="/admin/ai-credits" />
        <MiniCard icon="description" label="Proposals" value={data.proposals.sent} sub={`${data.proposals.accepted} accepted`} href="/admin/crm/proposals" />
        <MiniCard icon="shopping_cart" label="eCommerce" value={data.deals.won} sub="won deals" href="/admin/portal-ecommerce" />
      </div>

      {/* Recent Activity */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Tickets */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">support_agent</span>
              Recent Tickets
            </h2>
            <Link href="/admin/portal-tickets" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {data.recent.tickets.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No tickets</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recent.tickets.map(t => (
                <li key={t.id} className="px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/portal/tickets/${t.id}`} className="text-sm font-medium text-foreground hover:text-primary truncate block">
                        #{t.number} {t.subject}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColor(t.priority)}`}>{t.priority}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ticketStatusColor(t.status)}`}>{t.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">receipt_long</span>
              Recent Invoices
            </h2>
            <Link href="/admin/portal-invoices" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {data.recent.invoices.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No invoices</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recent.invoices.map(inv => (
                <li key={inv.id} className="px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Link href={`/portal/invoices/${inv.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                        {inv.number}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(inv.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatCents(inv.total)}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${invoiceStatusColor(inv.status)}`}>{inv.status}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">shopping_bag</span>
              Recent Orders
            </h2>
            <Link href="/admin/portal-ecommerce" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {data.recent.orders.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No orders</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recent.orders.map(o => (
                <li key={o.id} className="px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground font-mono">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{o.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatCents(o.total)}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${orderStatusColor(o.status)}`}>{o.status}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <QuickAction href="/admin/clients" icon="person_add" label="Add Client" />
          <QuickAction href="/admin/portal-invoices/new" icon="receipt" label="New Invoice" />
          <QuickAction href="/admin/portal-projects" icon="add_task" label="New Project" />
          <QuickAction href="/admin/portal-tickets" icon="support" label="View Tickets" />
          <QuickAction href="/admin/email/campaigns/new" icon="drafts" label="New Campaign" />
          <QuickAction href="/admin/crm/deals" icon="trending_up" label="View Deals" />
          <QuickAction href="/admin/mcp-usage" icon="query_stats" label="MCP Usage" />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, iconColor, label, value, sub, href }: {
  icon: string; iconColor: string; label: string; value: string; sub?: string; href: string;
}) {
  return (
    <Link href={href} className="bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-primary/20 transition-all group">
      <div className="flex items-center gap-2 mb-2">
        <span className={`material-icons text-lg ${iconColor}`}>{icon}</span>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Link>
  );
}

function MiniCard({ icon, label, value, sub, href, urgent }: {
  icon: string; label: string; value: string | number; sub?: string; href: string; urgent?: boolean;
}) {
  return (
    <Link href={href} className={`bg-card border rounded-xl p-3.5 hover:shadow-sm transition-all group ${
      urgent ? 'border-red-200 bg-red-50/50' : 'border-border'
    }`}>
      <div className="flex items-center gap-2">
        <span className={`material-icons text-base ${urgent ? 'text-red-500' : 'text-muted-foreground'}`}>{icon}</span>
        <span className="text-[11px] text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className={`text-xl font-bold mt-1 ${urgent ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </Link>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground hover:border-primary/20 transition-all"
    >
      <span className="material-icons text-base">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}
