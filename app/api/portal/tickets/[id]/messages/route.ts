import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, ticketMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  if (!isStaff) {
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [ticket] = await db.select().from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, client.id))).limit(1);
    if (!ticket) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  if (!body.body?.trim()) return NextResponse.json({ success: false, message: 'Message body is required' }, { status: 400 });

  const isInternal = isStaff ? (body.isInternal ?? false) : false;

  const [msg] = await db.insert(ticketMessages).values({
    ticketId,
    authorId: userId,
    body: body.body,
    isInternal,
  }).returning();

  // Auto-advance ticket status + stamp first-response SLA timer.
  //
  // `firstResponseAt` tracks STAFF responsiveness — it must only be stamped
  // when a staff user (admin/employee) posts a public (non-internal) reply
  // and the ticket has not already recorded a first response. Internal notes
  // and client replies must not stop the SLA clock.
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (ticket) {
    const updates: Record<string, unknown> = {};
    if (ticket.status === 'waiting' && !isStaff) {
      updates.status = 'open';
    } else if (ticket.status === 'open' && isStaff) {
      updates.status = 'in_progress';
    }
    if (isStaff && !isInternal && !ticket.firstResponseAt) {
      updates.firstResponseAt = new Date();
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(supportTickets).set(updates).where(eq(supportTickets.id, ticketId));
    }
  }

  return NextResponse.json({ success: true, data: msg });
}
