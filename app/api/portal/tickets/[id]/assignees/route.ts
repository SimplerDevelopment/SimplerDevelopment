import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, clientMembers, clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/portal/tickets/[id]/assignees
 *
 * Staff-only. Returns the team-member roster for the ticket's tenant so the
 * detail-page status control can render an assignee dropdown without needing
 * to know the tenant ID up front. Includes the legacy direct-owner
 * (clients.userId) even without a clientMembers row.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) {
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
  }

  const [ticket] = await db
    .select({ clientId: supportTickets.clientId })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: clientMembers.role,
    })
    .from(clientMembers)
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(eq(clientMembers.clientId, ticket.clientId));

  const candidates = new Map<number, { userId: number; name: string; email: string; role: string }>();
  for (const m of members) candidates.set(m.userId, m);

  // Make sure the legacy direct owner shows up even without a clientMembers row.
  const [client] = await db
    .select({ userId: clients.userId })
    .from(clients)
    .where(eq(clients.id, ticket.clientId))
    .limit(1);
  if (client?.userId && !candidates.has(client.userId)) {
    const [ownerUser] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, client.userId))
      .limit(1);
    if (ownerUser) {
      candidates.set(ownerUser.id, {
        userId: ownerUser.id,
        name: ownerUser.name,
        email: ownerUser.email,
        role: 'owner',
      });
    }
  }

  return NextResponse.json({ success: true, data: Array.from(candidates.values()) });
}
