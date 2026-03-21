import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, clients, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const data = await db
    .select({
      id: supportTickets.id,
      number: supportTickets.number,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      company: clients.company,
      clientName: users.name,
    })
    .from(supportTickets)
    .innerJoin(clients, eq(supportTickets.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(supportTickets.updatedAt));

  return NextResponse.json({ success: true, data });
}

export async function PATCH(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { id, status, assignedTo, priority } = body;

  const [ticket] = await db.update(supportTickets).set({
    ...(status && { status }),
    ...(assignedTo !== undefined && { assignedTo }),
    ...(priority && { priority }),
    ...(status === 'resolved' && { resolvedAt: new Date() }),
    updatedAt: new Date(),
  }).where(eq(supportTickets.id, id)).returning();

  return NextResponse.json({ success: true, data: ticket });
}
