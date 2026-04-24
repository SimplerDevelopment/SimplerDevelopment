import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanColumns, projects } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
  }

  const rows = await db
    .select({
      id: kanbanCards.id,
      title: kanbanCards.title,
      number: kanbanCards.number,
      columnIsDone: kanbanColumns.isDone,
    })
    .from(kanbanCards)
    .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
    .where(eq(kanbanCards.projectId, projectId))
    .orderBy(asc(kanbanCards.number));

  const data = rows.map(r => ({
    ...r,
    key: project.projectKey && r.number != null ? `${project.projectKey}-${r.number}` : null,
  }));

  return NextResponse.json({ success: true, data });
}
