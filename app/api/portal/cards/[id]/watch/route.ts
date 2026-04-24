import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardWatchers, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCardRead(cardId: number, session: any): Promise<boolean> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return false;
  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return true;
  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return false;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id))).limit(1);
  return !!proj;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (!(await authorizeCardRead(cardId, session))) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const userId = parseInt(session.user.id, 10);
  await db.insert(kanbanCardWatchers).values({ cardId, userId }).onConflictDoNothing();
  return NextResponse.json({ success: true, watching: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (!(await authorizeCardRead(cardId, session))) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const userId = parseInt(session.user.id, 10);
  await db.delete(kanbanCardWatchers).where(and(eq(kanbanCardWatchers.cardId, cardId), eq(kanbanCardWatchers.userId, userId)));
  return NextResponse.json({ success: true, watching: false });
}
