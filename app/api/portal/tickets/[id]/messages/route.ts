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

  const [msg] = await db.insert(ticketMessages).values({
    ticketId,
    authorId: userId,
    body: body.body,
    isInternal: isStaff ? (body.isInternal ?? false) : false,
  }).returning();

  // Auto-advance ticket status
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (ticket) {
    if (ticket.status === 'waiting' && !isStaff) {
      await db.update(supportTickets).set({ status: 'open', updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
    } else if (ticket.status === 'open' && isStaff) {
      await db.update(supportTickets).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
    }
  }

  return NextResponse.json({ success: true, data: msg });
}
