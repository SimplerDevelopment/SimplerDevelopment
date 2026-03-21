import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardComments, kanbanCardTimeLogs, kanbanCardFiles, users, clients, projects } from '@/lib/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';

function getRole(session: Awaited<ReturnType<typeof auth>>): string {
  return (session?.user as { role?: string })?.role ?? '';
}

async function authorizeCard(cardId: number, session: Awaited<ReturnType<typeof auth>>) {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return card;

  const userId = parseInt(session!.user!.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) return null;

  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return proj ? card : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const cardId = parseInt(id, 10);

    const card = await authorizeCard(cardId, session);
    if (!card) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const comments = await db
      .select({
        id: kanbanCardComments.id,
        body: kanbanCardComments.body,
        mentions: kanbanCardComments.mentions,
        createdAt: kanbanCardComments.createdAt,
        userId: kanbanCardComments.userId,
        userName: users.name,
      })
      .from(kanbanCardComments)
      .leftJoin(users, eq(kanbanCardComments.userId, users.id))
      .where(eq(kanbanCardComments.cardId, cardId))
      .orderBy(asc(kanbanCardComments.createdAt));

    const role = getRole(session);
    const isStaff = role === 'admin' || role === 'employee';

    const timeLogs = isStaff
      ? await db
          .select({
            id: kanbanCardTimeLogs.id,
            minutes: kanbanCardTimeLogs.minutes,
            note: kanbanCardTimeLogs.note,
            loggedAt: kanbanCardTimeLogs.loggedAt,
            userId: kanbanCardTimeLogs.userId,
            userName: users.name,
          })
          .from(kanbanCardTimeLogs)
          .leftJoin(users, eq(kanbanCardTimeLogs.userId, users.id))
          .where(eq(kanbanCardTimeLogs.cardId, cardId))
          .orderBy(desc(kanbanCardTimeLogs.loggedAt))
      : [];

    const files = await db
      .select({
        id: kanbanCardFiles.id,
        originalName: kanbanCardFiles.originalName,
        mimeType: kanbanCardFiles.mimeType,
        fileSize: kanbanCardFiles.fileSize,
        url: kanbanCardFiles.url,
        commentId: kanbanCardFiles.commentId,
        userId: kanbanCardFiles.userId,
        createdAt: kanbanCardFiles.createdAt,
        userName: users.name,
      })
      .from(kanbanCardFiles)
      .leftJoin(users, eq(kanbanCardFiles.userId, users.id))
      .where(eq(kanbanCardFiles.cardId, cardId))
      .orderBy(asc(kanbanCardFiles.createdAt));

    return NextResponse.json({ success: true, data: { card, comments, timeLogs, files } });
  } catch (err) {
    console.error('[GET /api/portal/cards/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const body = await req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
  if (body.sprintId !== undefined) updates.sprintId = body.sprintId ?? null;

  const [card] = await db.update(kanbanCards).set(updates).where(eq(kanbanCards.id, cardId)).returning();
  if (!card) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: card });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  await db.delete(kanbanCards).where(eq(kanbanCards.id, parseInt(id, 10)));
  return NextResponse.json({ success: true });
}
