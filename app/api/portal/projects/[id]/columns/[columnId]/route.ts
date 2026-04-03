import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanColumns, kanbanCards } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

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
