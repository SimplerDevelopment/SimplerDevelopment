import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardWatchers, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { gatePortalRole } from '@/lib/portal-auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCardRead(cardId: number, session: any): Promise<{ client: Awaited<ReturnType<typeof getPortalClient>> } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;
  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { client: null };
  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id))).limit(1);
  return proj ? { client } : null;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) { // role-gate: read-ok watching only writes the caller's OWN subscription row (their own notifications, exempt class); a viewer who can read the card may watch it
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const access = await authorizeCardRead(cardId, session);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  // role-matrix: read level on purpose (see the role-gate marker on the export line).
  if (access.client) {
    const denied = await gatePortalRole(parseInt(session.user.id, 10), access.client, 'read');
    if (denied) return denied;
  }

  const userId = parseInt(session.user.id, 10);
  await db.insert(kanbanCardWatchers).values({ cardId, userId }).onConflictDoNothing();
  return NextResponse.json({ success: true, watching: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) { // role-gate: read-ok watching only writes the caller's OWN subscription row (their own notifications, exempt class); a viewer who can read the card may watch it
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const access = await authorizeCardRead(cardId, session);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  // role-matrix: read level on purpose (see the role-gate marker on the export line).
  if (access.client) {
    const denied = await gatePortalRole(parseInt(session.user.id, 10), access.client, 'read');
    if (denied) return denied;
  }

  const userId = parseInt(session.user.id, 10);
  await db.delete(kanbanCardWatchers).where(and(eq(kanbanCardWatchers.cardId, cardId), eq(kanbanCardWatchers.userId, userId)));
  return NextResponse.json({ success: true, watching: false });
}
