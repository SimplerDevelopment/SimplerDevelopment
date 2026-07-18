// One retro per sprint. GET returns the retro + items grouped by kind;
// POST upserts the retro shell so items can attach. Only commenter+ can read,
// editor+ can mutate.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprintRetros, sprintRetroItems, sprints, projects, users } from '@/lib/db/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

async function authorize(sprintId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  if (!sprint) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, sprint.projectId)).limit(1);
  if (!project) return null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return {
    userId, sprint, project,
    canEdit: staff || (await canUserEditProject(userId, sprint.projectId)),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sprintId = parseInt(id, 10);
  const access = await authorize(sprintId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [retro] = await db.select().from(sprintRetros).where(eq(sprintRetros.sprintId, sprintId)).limit(1);
  if (!retro) return NextResponse.json({ success: true, data: { retro: null, items: { went_well: [], went_poorly: [], action_item: [] } } });

  const items = await db
    .select({
      id: sprintRetroItems.id,
      kind: sprintRetroItems.kind,
      text: sprintRetroItems.text,
      votes: sprintRetroItems.votes,
      authorUserId: sprintRetroItems.authorUserId,
      authorName: users.name,
      promotedCardId: sprintRetroItems.promotedCardId,
      createdAt: sprintRetroItems.createdAt,
    })
    .from(sprintRetroItems)
    .leftJoin(users, eq(users.id, sprintRetroItems.authorUserId))
    .where(eq(sprintRetroItems.retroId, retro.id))
    .orderBy(desc(sprintRetroItems.votes), asc(sprintRetroItems.createdAt));

  const grouped: Record<string, typeof items> = { went_well: [], went_poorly: [], action_item: [] };
  for (const it of items) (grouped[it.kind] ??= []).push(it);

  return NextResponse.json({ success: true, data: { retro, items: grouped } });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sprintId = parseInt(id, 10);
  const access = await authorize(sprintId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const [existing] = await db.select().from(sprintRetros).where(eq(sprintRetros.sprintId, sprintId)).limit(1);
  if (existing) return NextResponse.json({ success: true, data: existing });

  const [row] = await db.insert(sprintRetros).values({
    sprintId,
    status: 'open',
    createdBy: access.userId,
  }).returning();
  return NextResponse.json({ success: true, data: row }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sprintId = parseInt(id, 10);
  const access = await authorize(sprintId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const [existing] = await db.select().from(sprintRetros).where(eq(sprintRetros.sprintId, sprintId)).limit(1);
  if (!existing) return NextResponse.json({ success: false, message: 'Retro not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.status === 'string' && ['open', 'closed'].includes(body.status)) updates.status = body.status;

  const [row] = await db.update(sprintRetros).set(updates).where(eq(sprintRetros.id, existing.id)).returning();
  return NextResponse.json({ success: true, data: row });
}
