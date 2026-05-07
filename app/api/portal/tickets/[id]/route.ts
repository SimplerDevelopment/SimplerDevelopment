import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, clientMembers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createCrmNotification } from '@/lib/crm/notifications';

const ALLOWED_STATUSES = new Set([
  'open',
  'in_progress',
  'waiting_on_customer',
  'waiting', // legacy alias retained for back-compat
  'resolved',
  'closed',
]);

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return { userId: parseInt(session.user.id, 10) };
}

/**
 * GET /api/portal/tickets/[id]
 * Returns the ticket plus a flat assignee record. Staff-only — clients
 * already render the detail server-side via `/portal/tickets/[id]`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) {
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
  }

  const [row] = await db
    .select({
      ticket: supportTickets,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.assignedTo, users.id))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      ...row.ticket,
      assignee: row.ticket.assignedTo
        ? { id: row.ticket.assignedTo, name: row.assigneeName, email: row.assigneeEmail }
        : null,
    },
  });
}

/**
 * PATCH /api/portal/tickets/[id]
 *
 * Staff-only status + assignment workflow. Accepts:
 *   - status: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed'
 *   - assigneeId: number | null  (must be a member of the same tenant; null clears)
 *
 * Notifications fire for actual changes only:
 *   - ticket_assigned         → new assignee (skipped on self-assignment)
 *   - ticket_status_changed   → tenant team members + (if set) the assignee
 *
 * All notifications are fire-and-forget; the response is unaffected by emit failures.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) {
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const [existing] = await db
    .select({
      id: supportTickets.id,
      clientId: supportTickets.clientId,
      number: supportTickets.number,
      subject: supportTickets.subject,
      status: supportTickets.status,
      assignedTo: supportTickets.assignedTo,
      firstResponseAt: supportTickets.firstResponseAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  let nextStatus = existing.status;
  let nextAssignee = existing.assignedTo;

  // ── Status ──────────────────────────────────────────────────────────────
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
    }
    nextStatus = body.status;
    updates.status = body.status;
    if (body.status === 'resolved') updates.resolvedAt = new Date();
  }

  // ── Assignment ──────────────────────────────────────────────────────────
  // Accept `assigneeId` (preferred per the public PATCH contract) or `assignedTo`
  // (alias for legacy admin clients hitting this endpoint).
  const rawAssignee = body.assigneeId !== undefined ? body.assigneeId : body.assignedTo;
  if (rawAssignee !== undefined) {
    if (rawAssignee === null) {
      updates.assignedTo = null;
      nextAssignee = null;
    } else if (typeof rawAssignee === 'number' && Number.isFinite(rawAssignee)) {
      // Validate that the assignee is a member of the same tenant.
      const [member] = await db
        .select({ userId: clientMembers.userId })
        .from(clientMembers)
        .where(and(eq(clientMembers.clientId, existing.clientId), eq(clientMembers.userId, rawAssignee)))
        .limit(1);
      if (!member) {
        return NextResponse.json(
          { success: false, message: 'Assignee is not a member of this client' },
          { status: 400 },
        );
      }
      updates.assignedTo = rawAssignee;
      nextAssignee = rawAssignee;
    } else {
      return NextResponse.json({ success: false, message: 'Invalid assigneeId' }, { status: 400 });
    }
  }

  // ── First-response stamp ───────────────────────────────────────────────
  // Auto-fill on the first transition out of `open` if not already stamped.
  if (
    !existing.firstResponseAt &&
    nextStatus !== 'open' &&
    existing.status === 'open'
  ) {
    updates.firstResponseAt = new Date();
  }

  const [updated] = await db
    .update(supportTickets)
    .set(updates)
    .where(eq(supportTickets.id, ticketId))
    .returning();

  // ── Notifications (fire-and-forget) ────────────────────────────────────
  const assigneeChanged =
    rawAssignee !== undefined && nextAssignee !== existing.assignedTo;
  const statusChanged = body.status !== undefined && nextStatus !== existing.status;

  if (assigneeChanged && nextAssignee && nextAssignee !== staff.userId) {
    createCrmNotification({
      clientId: existing.clientId,
      userId: nextAssignee,
      type: 'ticket_assigned',
      title: `You were assigned to ticket #${existing.number}: ${existing.subject}`,
      entityType: 'ticket',
      entityId: existing.id,
    }).catch(console.error);
  }

  if (statusChanged) {
    // Notify the assignee (if different from the actor) so they see their queue move.
    if (nextAssignee && nextAssignee !== staff.userId) {
      createCrmNotification({
        clientId: existing.clientId,
        userId: nextAssignee,
        type: 'ticket_status_changed',
        title: `Ticket #${existing.number} → ${nextStatus.replace(/_/g, ' ')}`,
        body: existing.subject,
        entityType: 'ticket',
        entityId: existing.id,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ success: true, data: updated });
}
