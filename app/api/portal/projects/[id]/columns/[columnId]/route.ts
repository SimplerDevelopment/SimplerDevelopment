import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanColumns, kanbanCards } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

async function authorizeColumn(projectId: number, colId: number, session: { user?: { id?: string; role?: string } } | null) {
  const role = session?.user?.role;
  const isStaff = role === 'admin' || role === 'employee';
  if (isStaff) {
    const [col] = await db.select().from(kanbanColumns)
      .where(and(eq(kanbanColumns.id, colId), eq(kanbanColumns.projectId, projectId))).limit(1);
    return col ? { canEdit: true, col } : null;
  }
  const userId = parseInt(session?.user?.id ?? '', 10);
  if (Number.isNaN(userId)) return null;
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.clientId, client.id))).limit(1);
  if (!project) return null;
  const [col] = await db.select().from(kanbanColumns)
    .where(and(eq(kanbanColumns.id, colId), eq(kanbanColumns.projectId, projectId))).limit(1);
  if (!col) return null;
  return { canEdit: project.isPrivate, col };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; columnId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id, columnId } = await params;
  const projectId = parseInt(id, 10);
  const colId = parseInt(columnId, 10);

  const result = await authorizeColumn(projectId, colId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { name, color, isDone, wipLimit } = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim().slice(0, 100);
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) updates.color = color;
  if (typeof isDone === 'boolean') {
    if (isDone) {
      // Unset isDone on all other columns in the project (enforce single "done" column)
      await db.update(kanbanColumns).set({ isDone: false }).where(eq(kanbanColumns.projectId, projectId));
    }
    updates.isDone = isDone;
  }
  if (wipLimit === null || (typeof wipLimit === 'number' && wipLimit >= 0)) {
    updates.wipLimit = wipLimit === 0 ? null : wipLimit;
  }

  const [row] = await db.update(kanbanColumns).set(updates).where(eq(kanbanColumns.id, colId)).returning();
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; columnId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id, columnId } = await params;
  const projectId = parseInt(id, 10);
  const colId = parseInt(columnId, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';
  const userId = parseInt(session.user.id, 10);

  if (!isStaff) {
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.clientId, client.id))).limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  // Verify column belongs to this project
  const [col] = await db.select().from(kanbanColumns).where(and(eq(kanbanColumns.id, colId), eq(kanbanColumns.projectId, projectId))).limit(1);
  if (!col) return NextResponse.json({ success: false, message: 'Column not found' }, { status: 404 });

  // Only allow deleting empty columns
  const cards = await db.select({ id: kanbanCards.id }).from(kanbanCards).where(eq(kanbanCards.columnId, colId)).limit(1);
  if (cards.length > 0) {
    return NextResponse.json({ success: false, message: 'Cannot delete a column that has cards' }, { status: 400 });
  }

  await db.delete(kanbanColumns).where(eq(kanbanColumns.id, colId));

  return NextResponse.json({ success: true });
}
