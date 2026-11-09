import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardChecklistItems, projects, users } from '@/lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { gatePortalRole } from '@/lib/portal-auth';
import { logCardActivity } from '@/lib/pm-activity';
import { canUserEditProject } from '@/lib/portal/project-access';
import { publishBoardChangedForCard } from '@/lib/kanban/events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCardEdit(cardId: number, session: any): Promise<{ canEdit: boolean; client: Awaited<ReturnType<typeof getPortalClient>> } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;
  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { canEdit: true, client: null };
  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id))).limit(1);
  if (!proj) return null;
  return { canEdit: await canUserEditProject(userId, proj.id), client };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const a = await authorizeCardEdit(cardId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  // role-matrix: listing checklist items is a read (viewer+). `client` is null for staff.
  if (a.client) {
    const denied = await gatePortalRole(parseInt(session.user.id, 10), a.client, 'read');
    if (denied) return denied;
  }

  const items = await db
    .select({
      id: kanbanCardChecklistItems.id,
      text: kanbanCardChecklistItems.text,
      completed: kanbanCardChecklistItems.completed,
      order: kanbanCardChecklistItems.order,
      createdAt: kanbanCardChecklistItems.createdAt,
      completedAt: kanbanCardChecklistItems.completedAt,
    })
    .from(kanbanCardChecklistItems)
    .where(eq(kanbanCardChecklistItems.cardId, cardId))
    .orderBy(asc(kanbanCardChecklistItems.order), asc(kanbanCardChecklistItems.id));

  return NextResponse.json({ success: true, data: items });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const a = await authorizeCardEdit(cardId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  // role-matrix: adding a checklist item is a content edit (member+).
  if (a.client) {
    const denied = await gatePortalRole(parseInt(session.user.id, 10), a.client, 'write');
    if (denied) return denied;
  }
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { text } = await req.json();
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ success: false, message: 'Text required' }, { status: 400 });

  const [{ max }] = await db
    .select({ max: sql<number | null>`MAX(${kanbanCardChecklistItems.order})` })
    .from(kanbanCardChecklistItems)
    .where(eq(kanbanCardChecklistItems.cardId, cardId));
  const order = (max ?? -1) + 1;

  const userId = parseInt(session.user.id, 10);
  const [item] = await db.insert(kanbanCardChecklistItems).values({
    cardId,
    text: text.trim().slice(0, 500),
    order,
    createdBy: userId,
  }).returning();

  await logCardActivity(cardId, userId, 'card.checklist_item_added', { itemId: item.id, text: item.text });
  await publishBoardChangedForCard(cardId);
  return NextResponse.json({ success: true, data: item }, { status: 201 });
}
