// Project goals / OKRs CRUD scoped to a project. Editor+ to mutate.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectGoals, projects } from '@/lib/db/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

const STATUSES = ['draft', 'active', 'achieved', 'missed', 'dropped'] as const;

async function authorize(projectId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return { userId, project, canEdit: staff || (await canUserEditProject(userId, projectId)) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorize(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db.select().from(projectGoals)
    .where(eq(projectGoals.projectId, projectId))
    // Active first, then by target date ascending (soonest first), then newest.
    .orderBy(
      asc(projectGoals.status),
      asc(projectGoals.targetDate),
      desc(projectGoals.createdAt),
    );
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorize(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (!body.title?.trim()) return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });

  const status = STATUSES.includes(body.status) ? body.status : 'draft';
  const targetValue = typeof body.targetValue === 'number' && body.targetValue > 0 ? body.targetValue : 100;
  const currentValue = typeof body.currentValue === 'number' && body.currentValue >= 0 ? body.currentValue : 0;

  const [row] = await db.insert(projectGoals).values({
    projectId,
    title: body.title.trim().slice(0, 255),
    description: typeof body.description === 'string' ? body.description.slice(0, 5000) : null,
    unitLabel: typeof body.unitLabel === 'string' ? body.unitLabel.slice(0, 30) : null,
    currentValue,
    targetValue,
    targetDate: body.targetDate ? new Date(body.targetDate) : null,
    status,
    createdBy: access.userId,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
