import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanColumns, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { columnId, title, description, priority, dueDate } = await req.json();
  if (!columnId || !title?.trim()) {
    return NextResponse.json({ success: false, message: 'columnId and title are required' }, { status: 400 });
  }

  const [col] = await db.select().from(kanbanColumns).where(eq(kanbanColumns.id, columnId)).limit(1);
  if (!col) return NextResponse.json({ success: false, message: 'Column not found' }, { status: 404 });

  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';
  const userId = parseInt(session.user.id, 10);

  if (!isStaff) {
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [project] = await db.select().from(projects).where(and(eq(projects.id, col.projectId), eq(projects.clientId, client.id))).limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const existing = await db.select({ id: kanbanCards.id }).from(kanbanCards).where(eq(kanbanCards.columnId, columnId));

  const [card] = await db.insert(kanbanCards).values({
    columnId,
    projectId: col.projectId,
    title: title.trim(),
    description: description ?? null,
    priority: priority ?? 'medium',
    dueDate: dueDate ? new Date(dueDate) : null,
    order: existing.length,
    createdBy: parseInt(session.user.id, 10),
  }).returning();

  return NextResponse.json({ success: true, data: card });
}
