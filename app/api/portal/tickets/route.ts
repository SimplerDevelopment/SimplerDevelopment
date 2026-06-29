import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, ticketMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, max } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';
import { computeSlaDeadlines } from '@/lib/tickets/sla';
import { revalidateAdminDashboard } from '@/lib/admin/dashboard-cache';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const data = await db.select().from(supportTickets).where(eq(supportTickets.clientId, client.id)).orderBy(supportTickets.createdAt);
  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ success: false, message: 'Subject and body are required' }, { status: 400 });
  }

  const priority = body.priority ?? 'medium';
  const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines(priority);

  // Wrap number allocation + insert in a transaction so concurrent creates
  // from the same tenant cannot read the same max and collide on the same
  // number. max() is also scoped to this tenant (fixes the old cross-tenant
  // count() which was both a race and a tenancy bug).
  const { ticket } = await db.transaction(async (tx) => {
    const [{ maxNumber }] = await tx
      .select({ maxNumber: max(supportTickets.number) })
      .from(supportTickets)
      .where(eq(supportTickets.clientId, client.id));

    const ticketNumber = (maxNumber ?? 1000) + 1;

    const [newTicket] = await tx.insert(supportTickets).values({
      number: ticketNumber,
      clientId: client.id,
      subject: body.subject,
      category: body.category ?? 'general',
      priority,
      status: 'open',
      createdBy: userId,
      firstResponseDueAt,
      resolutionDueAt,
    }).returning();

    await tx.insert(ticketMessages).values({
      ticketId: newTicket.id,
      authorId: userId,
      body: body.body,
      isInternal: false,
    });

    return { ticket: newTicket };
  });

  emitEvent('ticket.created', client.id, userId, { id: ticket.id, number: ticket.number, subject: ticket.subject, category: ticket.category, priority: ticket.priority, status: 'open' });

  // E2 — invalidate the admin dashboard cache (counts the new open ticket).
  revalidateAdminDashboard();

  return NextResponse.json({ success: true, data: ticket });
}
