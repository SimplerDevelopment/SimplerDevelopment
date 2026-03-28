import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, ticketMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, count } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';

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

  // Auto-increment ticket number
  const [result] = await db.select({ count: count() }).from(supportTickets);
  const ticketNumber = (result?.count ?? 0) + 1001;

  const [ticket] = await db.insert(supportTickets).values({
    number: ticketNumber,
    clientId: client.id,
    subject: body.subject,
    category: body.category ?? 'general',
    priority: body.priority ?? 'medium',
    status: 'open',
    createdBy: userId,
  }).returning();

  // First message
  await db.insert(ticketMessages).values({
    ticketId: ticket.id,
    authorId: userId,
    body: body.body,
    isInternal: false,
  });

  emitEvent('ticket.created', client.id, userId, { id: ticket.id, number: ticket.number, subject: ticket.subject, category: ticket.category, priority: ticket.priority, status: 'open' });

  return NextResponse.json({ success: true, data: ticket });
}
