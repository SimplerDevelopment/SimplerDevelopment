import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardChecklistItems, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { logCardActivity } from '@/lib/pm-activity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeItem(itemId: number, session: any): Promise<{ cardId: number; canEdit: boolean; item: typeof kanbanCardChecklistItems.$inferSelect } | null> {
  const [item] = await db.select().from(kanbanCardChecklistItems).where(eq(kanbanCardChecklistItems.id, itemId)).limit(1);
  if (!item) return null;
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, item.cardId)).limit(1);
  if (!card) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { cardId: card.id, canEdit: true, item };

  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id))).limit(1);
  if (!proj) return null;
  return { cardId: card.id, canEdit: proj.isPrivate, item };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const itemId = parseInt(id, 10);
  const a = await authorizeItem(itemId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { text, completed, order } = await req.json();
  const userId = parseInt(session.user.id, 10);
  const updates: Record<string, unknown> = {};
  if (typeof text === 'string' && text.trim()) updates.text = text.trim().slice(0, 500);
  if (typeof order === 'number') updates.order = order;
  if (typeof completed === 'boolean') {
    updates.completed = completed;
    updates.completedAt = completed ? new Date() : null;
    updates.completedBy = completed ? userId : null;
  }

  const [row] = await db.update(kanbanCardChecklistItems).set(updates)
    .where(eq(kanbanCardChecklistItems.id, itemId)).returning();

  if (typeof completed === 'boolean' && completed !== a.item.completed) {
    await logCardActivity(
      a.cardId,
      userId,
      completed ? 'card.checklist_item_completed' : 'card.checklist_item_uncompleted',
      { itemId, text: a.item.text },
    );
  }

  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const itemId = parseInt(id, 10);
  const a = await authorizeItem(itemId, session);
  if (!a) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!a.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(kanbanCardChecklistItems).where(eq(kanbanCardChecklistItems.id, itemId));
  await logCardActivity(a.cardId, parseInt(session.user.id, 10), 'card.checklist_item_removed', { itemId, text: a.item.text });

  return NextResponse.json({ success: true });
}
