import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectGoals, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

const STATUSES = ['draft', 'active', 'achieved', 'missed', 'dropped'];

async function authorize(goalId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const [goal] = await db.select().from(projectGoals).where(eq(projectGoals.id, goalId)).limit(1);
  if (!goal) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, goal.projectId)).limit(1);
  if (!project) return null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return { goal, canEdit: staff || (await canUserEditProject(userId, goal.projectId)) };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const goalId = parseInt(id, 10);
  const access = await authorize(goalId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === 'string') updates.title = body.title.trim().slice(0, 255);
  if (typeof body.description === 'string' || body.description === null) updates.description = body.description?.slice(0, 5000) ?? null;
  if (typeof body.unitLabel === 'string' || body.unitLabel === null) updates.unitLabel = body.unitLabel ? String(body.unitLabel).slice(0, 30) : null;
  if (typeof body.currentValue === 'number' && body.currentValue >= 0) updates.currentValue = body.currentValue;
  if (typeof body.targetValue === 'number' && body.targetValue > 0) updates.targetValue = body.targetValue;
  if (typeof body.targetDate === 'string' || body.targetDate === null) updates.targetDate = body.targetDate ? new Date(body.targetDate) : null;
  if (typeof body.status === 'string' && STATUSES.includes(body.status)) updates.status = body.status;

  const [row] = await db.update(projectGoals).set(updates).where(eq(projectGoals.id, goalId)).returning();
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const goalId = parseInt(id, 10);
  const access = await authorize(goalId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(projectGoals).where(eq(projectGoals.id, goalId));
  return NextResponse.json({ success: true });
}
