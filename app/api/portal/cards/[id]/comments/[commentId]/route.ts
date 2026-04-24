import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardComments, kanbanCards, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCard(cardId: number, session: any): Promise<boolean> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return false;
  const s = session as unknown as { user?: { id: string; role?: string } } | null;
  const role = s?.user?.role;
  if (role === 'admin' || role === 'employee') return true;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return false;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return !!proj;
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id, commentId } = await params;
  const cardId = parseInt(id, 10);
  const cId = parseInt(commentId, 10);
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  if (!(await authorizeCard(cardId, session))) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  // Comment must belong to this card; non-staff must additionally be the author.
  const condition = isStaff
    ? and(eq(kanbanCardComments.id, cId), eq(kanbanCardComments.cardId, cardId))
    : and(eq(kanbanCardComments.id, cId), eq(kanbanCardComments.cardId, cardId), eq(kanbanCardComments.userId, userId));

  await db.delete(kanbanCardComments).where(condition);
  return NextResponse.json({ success: true });
}
