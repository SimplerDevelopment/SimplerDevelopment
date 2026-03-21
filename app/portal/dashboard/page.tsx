import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, projects, supportTickets, invoices } from '@/lib/db/schema';
import { eq, and, ne, count, sum } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatCents, ticketStatusColor, invoiceStatusColor, invoiceStatusLabel } from '@/lib/portal';

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);

  if (!client) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <span className="material-icons text-5xl text-muted-foreground">person_off</span>
        <h2 className="mt-4 text-xl font-semibold">No client profile found</h2>
        <p className="mt-2 text-muted-foreground text-sm">Please contact us to set up your account.</p>
      </div>
    );
  }

  const [activeProjects, openTickets, pendingInvoices] = await Promise.all([
    db.select({ count: count() }).from(projects).where(and(eq(projects.clientId, client.id), ne(projects.status, 'archived'))),
    db.select({ count: count() }).from(supportTickets).where(and(eq(supportTickets.clientId, client.id), ne(supportTickets.status, 'closed'))),
    db.select({ count: count(), total: sum(invoices.total) }).from(invoices).where(and(eq(invoices.clientId, client.id), eq(invoices.status, 'sent'))),
  ]);

  const recentTickets = await db.select().from(supportTickets).where(eq(supportTickets.clientId, client.id)).orderBy(supportTickets.createdAt).limit(5);
  const recentInvoices = await db.select().from(invoices).where(eq(invoices.clientId, client.id)).orderBy(invoices.createdAt).limit(5);

  const stats = [
    { label: 'Active Projects', value: activeProjects[0]?.count ?? 0, icon: 'view_kanban', href: '/portal/projects', color: 'text-blue-600' },
    { label: 'Open Tickets', value: openTickets[0]?.count ?? 0, icon: 'support_agent', href: '/portal/tickets', color: 'text-orange-600' },
    { label: 'Unpaid Invoices', value: pendingInvoices[0]?.count ?? 0, icon: 'receipt_long', href: '/portal/invoices', color: 'text-red-600' },
    { label: 'Amount Due', value: formatCents(Number(pendingInvoices[0]?.total ?? 0)), icon: 'attach_money', href: '/portal/invoices', color: 'text-green-600' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back{client.company ? `, ${client.company}` : ''}!</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your projects.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors group">
            <span className={`material-icons text-2xl ${s.color}`}>{s.icon}</span>
            <p className="mt-3 text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Tickets */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Recent Tickets</h2>
            <Link href="/portal/tickets" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {recentTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No tickets yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentTickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/portal/tickets/${t.id}`} className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">#{t.number} {t.subject}</p>
                      <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${ticketStatusColor(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Recent Invoices</h2>
            <Link href="/portal/invoices" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No invoices yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentInvoices.map((inv) => (
                <li key={inv.id}>
                  <Link href={`/portal/invoices/${inv.id}`} className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{inv.number}</p>
                      <p className="text-xs text-muted-foreground">{formatCents(inv.total)}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${invoiceStatusColor(inv.status)}`}>
                      {invoiceStatusLabel(inv.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/portal/tickets/new" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <span className="material-icons text-base">add</span>
            Open Support Ticket
          </Link>
          <Link href="/portal/projects" className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <span className="material-icons text-base">view_kanban</span>
            View Projects
          </Link>
          <Link href="/portal/services" className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <span className="material-icons text-base">storefront</span>
            Browse Services
          </Link>
        </div>
      </div>
    </div>
  );
}
