import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanColumns } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';
  const userId = parseInt(session.user.id, 10);

  if (!isStaff) {
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.clientId, client.id))).limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const { columnIds } = await req.json() as { columnIds: number[] };
  if (!Array.isArray(columnIds)) {
    return NextResponse.json({ success: false, message: 'columnIds array required' }, { status: 400 });
  }

  // Update each column's order
  await Promise.all(
    columnIds.map((colId, index) =>
      db.update(kanbanColumns)
        .set({ order: index })
        .where(and(eq(kanbanColumns.id, colId), eq(kanbanColumns.projectId, projectId)))
    )
  );

  return NextResponse.json({ success: true });
}
