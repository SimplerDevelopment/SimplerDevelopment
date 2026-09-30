import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardComments, kanbanCards, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { gatePortalRole } from '@/lib/portal-auth';
import { publishBoardChangedForCard } from '@/lib/kanban/events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCard(cardId: number, session: any): Promise<{ client: Awaited<ReturnType<typeof getPortalClient>> } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;
  const s = session as unknown as { user?: { id: string; role?: string } } | null;
  const role = s?.user?.role;
  if (role === 'admin' || role === 'employee') return { client: null };
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return proj ? { client } : null;
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

  const access = await authorizeCard(cardId, session);
  if (!access) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  // role-matrix: deleting a comment is a content edit (member+; non-staff may also only delete their own).
  if (access.client) {
    const denied = await gatePortalRole(parseInt(session.user.id, 10), access.client, 'write');
    if (denied) return denied;
  }

  // Comment must belong to this card; non-staff must additionally be the author.
  const condition = isStaff
    ? and(eq(kanbanCardComments.id, cId), eq(kanbanCardComments.cardId, cardId))
    : and(eq(kanbanCardComments.id, cId), eq(kanbanCardComments.cardId, cardId), eq(kanbanCardComments.userId, userId));

  await db.delete(kanbanCardComments).where(condition);
  await publishBoardChangedForCard(cardId);
  return NextResponse.json({ success: true });
}
