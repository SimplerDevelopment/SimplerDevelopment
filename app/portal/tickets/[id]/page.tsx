import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, supportTickets, ticketMessages, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ticketStatusColor, priorityColor } from '@/lib/portal';
import TicketReplyForm from '@/components/portal/TicketReplyForm';
import TicketStatusControl from '@/components/portal/TicketStatusControl';
import TicketSlaBadge from '@/components/portal/TicketSlaBadge';
import { SLA_BY_PRIORITY, type TicketPriority } from '@/lib/tickets/sla';

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  let clientId: number | null = null;
  if (!isStaff) {
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!client) redirect('/portal/dashboard');
    clientId = client.id;
  }

  const ticketQuery = isStaff
    ? db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1)
    : db.select().from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, clientId!))).limit(1);

  const [ticket] = await ticketQuery;
  if (!ticket) notFound();

  // Resolve assignee name for the header badge (cheap join — ticket is already loaded).
  let assigneeName: string | null = null;
  if (ticket.assignedTo) {
    const [assigneeRow] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, ticket.assignedTo))
      .limit(1);
    assigneeName = assigneeRow?.name ?? null;
  }

  const slaPolicy = SLA_BY_PRIORITY[(ticket.priority as TicketPriority) ?? 'medium']
    ?? SLA_BY_PRIORITY.medium;

  // Fetch messages (hide internal notes from clients)
  const messageFilter = isStaff
    ? eq(ticketMessages.ticketId, ticketId)
    : and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.isInternal, false));

  const messages = await db
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      isInternal: ticketMessages.isInternal,
      createdAt: ticketMessages.createdAt,
      authorName: users.name,
      authorRole: users.role,
    })
    .from(ticketMessages)
    .innerJoin(users, eq(ticketMessages.authorId, users.id))
    .where(messageFilter!)
    .orderBy(ticketMessages.createdAt);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/tickets" className="hover:text-foreground transition-colors">Support</Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span className="text-foreground">#{ticket.number} {ticket.subject}</span>
      </div>

      {/* Ticket Header */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Opened {new Date(ticket.createdAt).toLocaleDateString()} &bull; {ticket.category} &bull; #{ticket.number}
              {assigneeName && (
                <>
                  {' '}&bull;{' '}
                  <span className="inline-flex items-center gap-1">
                    <span className="material-icons text-sm align-middle">person</span>
                    {assigneeName}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor(ticket.priority)}`}>
              {ticket.priority}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${ticketStatusColor(ticket.status)}`}>
              {ticket.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* SLA badges */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
          <div className="text-xs text-muted-foreground">
            SLA: <span className="text-foreground font-medium">{slaPolicy.label}</span>
          </div>
          <TicketSlaBadge
            status={ticket.status}
            firstResponseDueAt={ticket.firstResponseDueAt}
            resolutionDueAt={ticket.resolutionDueAt}
            resolvedAt={ticket.resolvedAt}
          />
        </div>
      </div>

      {/* Staff-only status + assignment controls */}
      {isStaff && (
        <TicketStatusControl
          ticketId={ticketId}
          initialStatus={ticket.status}
          initialAssigneeId={ticket.assignedTo}
        />
      )}

      {/* Thread */}
      <div className="space-y-4">
        {messages.map((msg) => {
          const isStaffMsg = msg.authorRole === 'admin' || msg.authorRole === 'employee';
          return (
            <div
              key={msg.id}
              className={`bg-card border rounded-xl p-5 ${
                msg.isInternal
                  ? 'border-yellow-200 bg-yellow-50'
                  : isStaffMsg
                  ? 'border-primary/20 bg-primary/5'
                  : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isStaffMsg ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {msg.authorName[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{msg.authorName}</p>
                    {isStaffMsg && <p className="text-xs text-muted-foreground">Simpler Development</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {msg.isInternal && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium">Internal Note</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="text-sm text-foreground whitespace-pre-wrap">{msg.body}</div>
            </div>
          );
        })}
      </div>

      {/* Reply form */}
      {ticket.status !== 'closed' && (
        <TicketReplyForm ticketId={ticketId} isStaff={isStaff} />
      )}

      {ticket.status === 'closed' && (
        <div className="bg-muted/50 border border-border rounded-xl p-4 text-center text-sm text-muted-foreground">
          This ticket is closed. <Link href="/portal/tickets/new" className="text-primary hover:underline">Open a new ticket</Link> if you need further help.
        </div>
      )}
    </div>
  );
}
