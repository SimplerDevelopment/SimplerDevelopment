import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardFiles, kanbanCards, users, projects } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const role = (session.user as { role?: string })?.role;
    const isStaff = role === 'admin' || role === 'employee';

    if (!isStaff) {
      const userId = parseInt(session.user.id, 10);
      const client = await getPortalClient(userId);
      if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      const [proj] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, client.id)))
        .limit(1);
      if (!proj) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const data = await db
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
        cardId: kanbanCards.id,
        cardTitle: kanbanCards.title,
      })
      .from(kanbanCardFiles)
      .leftJoin(users, eq(kanbanCardFiles.userId, users.id))
      .leftJoin(kanbanCards, eq(kanbanCardFiles.cardId, kanbanCards.id))
      .where(eq(kanbanCardFiles.projectId, projectId))
      .orderBy(asc(kanbanCardFiles.createdAt));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[GET /api/portal/projects/[id]/files]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
