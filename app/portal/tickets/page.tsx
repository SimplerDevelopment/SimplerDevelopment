import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, supportTickets, users } from '@/lib/db/schema';
import { eq, and, isNull, type SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ticketStatusColor, priorityColor } from '@/lib/portal';
import TicketSlaBadge from '@/components/portal/TicketSlaBadge';
import TicketIndexFilters from '@/components/portal/TicketIndexFilters';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary } from '@/components/portal/portal-ui';

interface SearchParams {
  status?: string | string[];
  priority?: string | string[];
  assignee?: string | string[];
  overdue?: string | string[];
}

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function TicketsIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const params = await searchParams;
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  // ── Tenant scoping ──────────────────────────────────────────────────────
  let clientId: number | null = null;
  if (!isStaff) {
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!client) redirect('/portal/dashboard');
    clientId = client.id;
  }

  // ── Filters ─────────────────────────────────────────────────────────────
  const filterStatus = single(params.status);
  const filterPriority = single(params.priority);
  const filterAssignee = single(params.assignee);
  const filterOverdue = single(params.overdue) === '1';

  const conditions: SQL[] = [];
  if (clientId !== null) conditions.push(eq(supportTickets.clientId, clientId));
  // The UI filter uses the short label 'waiting'; the schema column stores 'waiting_on_customer'.
  const resolvedStatus = filterStatus === 'waiting' ? 'waiting_on_customer' : filterStatus;
  if (resolvedStatus && resolvedStatus !== 'all') conditions.push(eq(supportTickets.status, resolvedStatus));
  if (filterPriority && filterPriority !== 'all') conditions.push(eq(supportTickets.priority, filterPriority));
  if (filterAssignee === 'me') conditions.push(eq(supportTickets.assignedTo, userId));
  else if (filterAssignee === 'unassigned') conditions.push(isNull(supportTickets.assignedTo));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // ── Query ───────────────────────────────────────────────────────────────
  const baseQuery = db
    .select({
      id: supportTickets.id,
      number: supportTickets.number,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      assignedTo: supportTickets.assignedTo,
      assigneeName: users.name,
      firstResponseDueAt: supportTickets.firstResponseDueAt,
      resolutionDueAt: supportTickets.resolutionDueAt,
      resolvedAt: supportTickets.resolvedAt,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      clientCompany: clients.company,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.assignedTo, users.id))
    .leftJoin(clients, eq(supportTickets.clientId, clients.id));

  const ticketsRaw = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
    .orderBy(supportTickets.createdAt);

  // Apply overdue filter in JS (cleaner than partial Drizzle expressions
  // covering both `firstResponseDueAt` and `resolutionDueAt`).
  const now = new Date();
  let tickets = ticketsRaw;
  if (filterOverdue) {
    tickets = tickets.filter((t) => {
      if (t.status === 'resolved' || t.status === 'closed') return false;
      const responseDue = t.firstResponseDueAt ? new Date(t.firstResponseDueAt) : null;
      const resolutionDue = t.resolutionDueAt ? new Date(t.resolutionDueAt) : null;
      return (
        (responseDue !== null && responseDue.getTime() < now.getTime()) ||
        (resolutionDue !== null && resolutionDue.getTime() < now.getTime())
      );
    });
  }

  // Reverse-chrono — most recent first
  tickets = [...tickets].reverse();

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Support"
        title="Support Tickets"
        subtitle={<>Track conversations with our team. {isStaff ? 'Showing tickets across all tenants you can see.' : "Only your tenant's tickets are shown."}</>}
        actions={
          <Link href="/portal/tickets/new" className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>
            New Ticket
          </Link>
        }
      />

      <TicketIndexFilters
        isStaff={isStaff}
        initial={{
          status: filterStatus ?? 'all',
          priority: filterPriority ?? 'all',
          assignee: filterAssignee ?? 'all',
          overdue: filterOverdue,
        }}
      />

      {tickets.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">support_agent</span>
          <h3 className="mt-4 font-semibold text-foreground">No tickets match these filters</h3>
          <p className="mt-2 text-sm text-muted-foreground">Try clearing the filters or open a new ticket.</p>
          <div className="mt-4 inline-flex items-center gap-2">
            <Link href="/portal/tickets" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Clear filters
            </Link>
            <Link href="/portal/tickets/new" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
              <span className="material-icons text-base">add</span>
              Open Ticket
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl">
          <div className="overflow-x-auto rounded-xl">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</th>
                {isStaff && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tenant</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">SLA</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Assignee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">#{ticket.number}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/portal/tickets/${ticket.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                  </td>
                  {isStaff && (
                    <td className="px-4 py-3 text-xs text-muted-foreground">{ticket.clientCompany ?? '—'}</td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ticketStatusColor(ticket.status)}`}>
                      {ticket.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TicketSlaBadge
                      status={ticket.status}
                      firstResponseDueAt={ticket.firstResponseDueAt}
                      resolutionDueAt={ticket.resolutionDueAt}
                      resolvedAt={ticket.resolvedAt}
                      compact
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {ticket.assigneeName ?? <span className="italic">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(ticket.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Looking for the legacy view? It still lives at{' '}
        <Link href="/portal/settings/support" className="text-primary hover:underline">
          Settings → Support
        </Link>
        .
      </p>
    </div>
  );
}
