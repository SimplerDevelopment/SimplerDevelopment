// PATCH (vote/edit/promote) and DELETE one retro item.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  sprintRetroItems, sprintRetros, sprints, projects, projectMembers,
} from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { roleAtLeast, type ProjectRole } from '@/lib/portal/project-permissions';

async function authorize(itemId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [item] = await db.select().from(sprintRetroItems).where(eq(sprintRetroItems.id, itemId)).limit(1);
  if (!item) return null;
  const [retro] = await db.select().from(sprintRetros).where(eq(sprintRetros.id, item.retroId)).limit(1);
  if (!retro) return null;
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, retro.sprintId)).limit(1);
  if (!sprint) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, sprint.projectId)).limit(1);
  if (!project) return null;

  if (staff) return { userId, item, project, role: 'owner' as ProjectRole };

  const client = await getPortalClient(userId);
  if (!client || client.id !== project.clientId) return null;

  const [member] = await db.select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, sprint.projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  const role = (member?.role as ProjectRole) ?? null;
  return { userId, item, project, role };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  const access = await authorize(itemId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();

  // Vote: anyone with at least viewer access can +1.
  if (body.vote === 1) {
    if (!roleAtLeast(access.role, 'viewer')) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    const [row] = await db.update(sprintRetroItems)
      .set({ votes: sql`${sprintRetroItems.votes} + 1` })
      .where(eq(sprintRetroItems.id, itemId))
      .returning();
    return NextResponse.json({ success: true, data: row });
  }

  // Edit text: only the author or an editor+ on the project.
  const updates: Record<string, unknown> = {};
  if (typeof body.text === 'string') {
    const isAuthor = access.userId === access.item.authorUserId;
    const isEditor = roleAtLeast(access.role, 'editor');
    if (!isAuthor && !isEditor) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    updates.text = body.text.trim().slice(0, 2000);
  }
  if (typeof body.promotedCardId === 'number' || body.promotedCardId === null) {
    if (!roleAtLeast(access.role, 'editor')) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    updates.promotedCardId = body.promotedCardId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, message: 'No-op' }, { status: 400 });
  }

  const [row] = await db.update(sprintRetroItems).set(updates).where(eq(sprintRetroItems.id, itemId)).returning();
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  const access = await authorize(itemId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const isAuthor = access.userId === access.item.authorUserId;
  const isEditor = roleAtLeast(access.role, 'editor');
  if (!isAuthor && !isEditor) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  await db.delete(sprintRetroItems).where(eq(sprintRetroItems.id, itemId));
  return NextResponse.json({ success: true });
}
