// POST a new retro item. Commenter+ on the parent project.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprintRetros, sprintRetroItems, sprints, projects, projectMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { roleAtLeast, type ProjectRole } from '@/lib/portal/project-permissions';

async function authorize(retroId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [retro] = await db.select().from(sprintRetros).where(eq(sprintRetros.id, retroId)).limit(1);
  if (!retro) return null;
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, retro.sprintId)).limit(1);
  if (!sprint) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, sprint.projectId)).limit(1);
  if (!project) return null;

  if (staff) return { userId, retro, project, canParticipate: true };

  const client = await getPortalClient(userId);
  if (!client || client.id !== project.clientId) return null;

  const [member] = await db.select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, sprint.projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  const canParticipate = roleAtLeast((member?.role as ProjectRole) ?? null, 'commenter');
  return { userId, retro, project, canParticipate };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const retroId = parseInt(id, 10);
  const access = await authorize(retroId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canParticipate) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { kind, text } = body;
  if (!['went_well', 'went_poorly', 'action_item'].includes(kind)) {
    return NextResponse.json({ success: false, message: 'kind must be went_well | went_poorly | action_item' }, { status: 400 });
  }
  if (!text?.trim()) return NextResponse.json({ success: false, message: 'text is required' }, { status: 400 });

  const [row] = await db.insert(sprintRetroItems).values({
    retroId,
    kind,
    text: text.trim().slice(0, 2000),
    authorUserId: access.userId,
  }).returning();
  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
