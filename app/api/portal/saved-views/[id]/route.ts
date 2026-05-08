// Per-view PATCH / DELETE. Uses the same authorization model as the parent
// list endpoint: editors can mutate shared views; users can mutate their own
// private views.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectSavedViews, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

async function authorizeView(viewId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [view] = await db.select().from(projectSavedViews).where(eq(projectSavedViews.id, viewId)).limit(1);
  if (!view) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, view.projectId)).limit(1);
  if (!project) return null;

  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }

  // Mutation rule:
  //   - Private view (userId set): only the owning user, or staff, can mutate.
  //   - Shared view (userId null): editors + can mutate.
  let canMutate = false;
  if (view.userId !== null) {
    canMutate = staff || view.userId === userId;
  } else {
    canMutate = staff || (await canUserEditProject(userId, view.projectId));
  }
  return { view, canMutate };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewId = parseInt(id, 10);
  const access = await authorizeView(viewId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canMutate) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === 'string') updates.name = body.name.trim().slice(0, 100);
  if (body.filterJson && typeof body.filterJson === 'object') updates.filterJson = body.filterJson;
  if (typeof body.isDefault === 'boolean') updates.isDefault = body.isDefault;

  const [row] = await db.update(projectSavedViews).set(updates).where(eq(projectSavedViews.id, viewId)).returning();
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewId = parseInt(id, 10);
  const access = await authorizeView(viewId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canMutate) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(projectSavedViews).where(eq(projectSavedViews.id, viewId));
  return NextResponse.json({ success: true });
}
