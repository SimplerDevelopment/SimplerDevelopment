import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardDependencies, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { logCardActivity } from '@/lib/pm-activity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCardEdit(cardId: number, session: any): Promise<{ card: typeof kanbanCards.$inferSelect; canEdit: boolean } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;
  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { card, canEdit: true };
  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id))).limit(1);
  if (!proj) return null;
  return { card, canEdit: proj.isPrivate };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const a = await authorizeCardEdit(cardId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { blockerCardId } = await req.json();
  if (typeof blockerCardId !== 'number' || blockerCardId === cardId) {
    return NextResponse.json({ success: false, message: 'Invalid blockerCardId' }, { status: 400 });
  }

  const [blocker] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, blockerCardId)).limit(1);
  if (!blocker || blocker.projectId !== a.card.projectId) {
    return NextResponse.json({ success: false, message: 'Blocker must be in the same project' }, { status: 400 });
  }

  // Prevent a direct reciprocal cycle (A blocks B, B blocks A)
  const [reciprocal] = await db.select().from(kanbanCardDependencies)
    .where(and(eq(kanbanCardDependencies.blockedCardId, blockerCardId), eq(kanbanCardDependencies.blockerCardId, cardId)))
    .limit(1);
  if (reciprocal) {
    return NextResponse.json({ success: false, message: 'Reciprocal dependency would create a cycle' }, { status: 400 });
  }

  await db.insert(kanbanCardDependencies).values({ blockedCardId: cardId, blockerCardId }).onConflictDoNothing();
  await logCardActivity(cardId, parseInt(session.user.id, 10), 'card.dependency_added', { blockerCardId, title: blocker.title });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const a = await authorizeCardEdit(cardId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const blockerCardId = parseInt(url.searchParams.get('blockerCardId') ?? '', 10);
  if (Number.isNaN(blockerCardId)) return NextResponse.json({ success: false, message: 'blockerCardId required' }, { status: 400 });

  await db.delete(kanbanCardDependencies)
    .where(and(eq(kanbanCardDependencies.blockedCardId, cardId), eq(kanbanCardDependencies.blockerCardId, blockerCardId)));
  await logCardActivity(cardId, parseInt(session.user.id, 10), 'card.dependency_removed', { blockerCardId });

  return NextResponse.json({ success: true });
}
