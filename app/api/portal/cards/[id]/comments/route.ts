import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardComments, kanbanCardFiles, projects } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, inArray } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCard(cardId: number, session: any) {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;

  const s = session as unknown as { user?: { id: string; role?: string } } | null;
  const role = s?.user?.role;
  if (role === 'admin' || role === 'employee') return card;

  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return proj ? card : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);

  const card = await authorizeCard(cardId, session);
  if (!card) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { body, mentions, fileIds } = await req.json();
  if (!body?.trim() && (!fileIds?.length)) return NextResponse.json({ success: false, message: 'body is required' }, { status: 400 });

  const [comment] = await db.insert(kanbanCardComments).values({
    cardId,
    userId: parseInt(session.user.id, 10),
    body: body?.trim() ?? '',
    mentions: mentions ?? [],
  }).returning();

  if (fileIds?.length) {
    await db.update(kanbanCardFiles)
      .set({ commentId: comment.id })
      .where(inArray(kanbanCardFiles.id, fileIds));
  }

  return NextResponse.json({ success: true, data: { ...comment, userName: session.user.name ?? null } });
}
