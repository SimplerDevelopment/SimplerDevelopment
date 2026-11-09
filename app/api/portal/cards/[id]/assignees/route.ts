import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardAssignees, kanbanCardWatchers, projects, users } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { logCardActivity } from '@/lib/pm-activity';
import { canUserEditProject } from '@/lib/portal/project-access';
import { publishBoardChangedForCard } from '@/lib/kanban/events';
import { assertUserVisibleToClient, OwnershipError } from '@/lib/security/assert-owned';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCardEdit(cardId: number, session: any): Promise<{ canEdit: boolean } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;
  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { canEdit: true };
  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id))).limit(1);
  if (!proj) return null;
  return { canEdit: await canUserEditProject(userId, proj.id) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const a = await authorizeCardEdit(cardId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(kanbanCardAssignees)
    .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
    .where(eq(kanbanCardAssignees.cardId, cardId))
    .orderBy(asc(users.name));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const a = await authorizeCardEdit(cardId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { userId: targetUserId } = await req.json();
  if (typeof targetUserId !== 'number') return NextResponse.json({ success: false, message: 'userId required' }, { status: 400 });

  // PUX-230: the assignee must belong to the card's OWNING company (or be staff).
  // Unchecked, any editor could assign arbitrary platform users, read their name
  // and email back from GET, and auto-watch would mail them this card's content.
  // Resolved from the card itself so it holds for staff and members alike.
  const [owning] = await db.select({ clientId: projects.clientId }).from(kanbanCards)
    .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
    .where(eq(kanbanCards.id, cardId)).limit(1);
  if (!owning) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  try {
    await assertUserVisibleToClient(targetUserId, owning.clientId);
  } catch (err) {
    if (err instanceof OwnershipError) {
      return NextResponse.json({ success: false, message: 'That user is not on this team' }, { status: 403 });
    }
    throw err;
  }

  await db.insert(kanbanCardAssignees).values({ cardId, userId: targetUserId }).onConflictDoNothing();
  // Auto-watch when assigned
  await db.insert(kanbanCardWatchers).values({ cardId, userId: targetUserId }).onConflictDoNothing();

  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, targetUserId)).limit(1);
  await logCardActivity(cardId, parseInt(session.user.id, 10), 'card.assignee_added', { userId: targetUserId, name: u?.name ?? null });

  await publishBoardChangedForCard(cardId);
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
  const targetUserId = parseInt(url.searchParams.get('userId') ?? '', 10);
  if (Number.isNaN(targetUserId)) return NextResponse.json({ success: false, message: 'userId required' }, { status: 400 });

  const removed = await db.delete(kanbanCardAssignees)
    .where(and(eq(kanbanCardAssignees.cardId, cardId), eq(kanbanCardAssignees.userId, targetUserId)))
    .returning({ userId: kanbanCardAssignees.userId });

  // Only name someone in the activity feed if they were actually assigned —
  // otherwise DELETE ?userId=<anyone> would write any user's name into it (PUX-230).
  if (removed.length > 0) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, targetUserId)).limit(1);
    await logCardActivity(cardId, parseInt(session.user.id, 10), 'card.assignee_removed', { userId: targetUserId, name: u?.name ?? null });
  }

  await publishBoardChangedForCard(cardId);
  return NextResponse.json({ success: true });
}
