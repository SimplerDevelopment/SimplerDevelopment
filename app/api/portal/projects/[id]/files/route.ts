import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardFiles, kanbanCards, users, projects } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

    // Parallelize auth + project lookup so the staff/client gate doesn't have
    // to wait sequentially. Profile showed 2.2s for empty results on this
    // endpoint and the sequential gate was a chunk of that.
    const [session, projectRows] = await Promise.all([
      auth(),
      db.select({ id: projects.id, clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1),
    ]);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const project = projectRows[0];
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const role = (session.user as { role?: string })?.role;
    const isStaff = role === 'admin' || role === 'employee';

    if (!isStaff) {
      const userId = parseInt(session.user.id, 10);
      const client = await getPortalClient(userId);
      if (!client || client.id !== project.clientId) {
        return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
      }
    }

    // Pagination — default 100, capped at 200. The previous handler returned
    // every file in the project unbounded.
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100));
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const offset = (page - 1) * limit;

    // Slim projection — kanban_card_files.data blob (if present in the row
    // shape) is intentionally omitted; the URL is the canonical fetch
    // location. Keeping the same column set as before.
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
      .orderBy(asc(kanbanCardFiles.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(
      { success: true, data, page, limit },
      { headers: { 'Cache-Control': 'private, max-age=10' } },
    );
  } catch (err) {
    console.error('[GET /api/portal/projects/[id]/files]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
