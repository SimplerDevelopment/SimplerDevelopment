import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprints, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { canUserEditProject } from '@/lib/portal/project-access';
import { recordSprintStarted } from '@/lib/portal/sprint-snapshots';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeSprint(sprintId: number, session: any): Promise<{ canEdit: boolean } | null> {
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  if (!sprint) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { canEdit: true };

  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, sprint.projectId)).limit(1);
  if (!project || project.clientId !== client.id) return null;

  return { canEdit: await canUserEditProject(userId, project.id) };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const sprintId = parseInt(id, 10);

    const result = await authorizeSprint(sprintId, session);
    if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const [before] = await db.select({ status: sprints.status }).from(sprints).where(eq(sprints.id, sprintId)).limit(1);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.goal !== undefined) updates.goal = body.goal;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updates.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.status !== undefined) updates.status = body.status;

    const [sprint] = await db.update(sprints).set(updates).where(eq(sprints.id, sprintId)).returning();
    if (!sprint) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    // Snapshot the committed scope at the moment a sprint starts so burndown
    // has a day-zero baseline. Only fires on the planning → active transition.
    if (body.status === 'active' && before?.status !== 'active') {
      const actorId = parseInt(session.user.id, 10);
      await recordSprintStarted(sprintId, actorId);
    }

    return NextResponse.json({ success: true, data: sprint });
  } catch (err) {
    console.error('[PATCH /api/portal/sprints/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const sprintId = parseInt(id, 10);

    const result = await authorizeSprint(sprintId, session);
    if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    await db.delete(sprints).where(eq(sprints.id, sprintId));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/portal/sprints/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
