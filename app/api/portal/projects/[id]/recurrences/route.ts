// CRUD for card_recurrences scoped to a project. Editor+ to mutate.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cardRecurrences, projects, kanbanColumns } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';
import { computeNextFireAt, type Cadence } from '@/lib/portal/recurrence-scheduler';

const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly'];

async function authorizeProject(projectId: number) {
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
  const access = await authorizeProject(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db.select().from(cardRecurrences)
    .where(eq(cardRecurrences.projectId, projectId))
    .orderBy(asc(cardRecurrences.nextFireAt));
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorizeProject(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { columnId, templateId, titlePattern, description, cadence, dayOfWeek, dayOfMonth, hourUtc } = body;

  if (!CADENCES.includes(cadence)) {
    return NextResponse.json({ success: false, message: 'cadence must be daily | weekly | monthly' }, { status: 400 });
  }
  if (typeof columnId !== 'number') {
    return NextResponse.json({ success: false, message: 'columnId is required' }, { status: 400 });
  }
  // Column must belong to this project.
  const [col] = await db.select({ id: kanbanColumns.id, projectId: kanbanColumns.projectId })
    .from(kanbanColumns).where(eq(kanbanColumns.id, columnId)).limit(1);
  if (!col || col.projectId !== projectId) {
    return NextResponse.json({ success: false, message: 'Column not in this project' }, { status: 400 });
  }
  if (!templateId && !titlePattern?.trim()) {
    return NextResponse.json({ success: false, message: 'Either templateId or titlePattern is required' }, { status: 400 });
  }

  const hour = typeof hourUtc === 'number' && hourUtc >= 0 && hourUtc <= 23 ? hourUtc : 9;
  const cfg = {
    cadence: cadence as Cadence,
    dayOfWeek: typeof dayOfWeek === 'number' ? dayOfWeek : null,
    dayOfMonth: typeof dayOfMonth === 'number' ? dayOfMonth : null,
    hourUtc: hour,
  };
  const nextFire = computeNextFireAt(new Date(), cfg);

  const [row] = await db.insert(cardRecurrences).values({
    projectId,
    columnId,
    templateId: typeof templateId === 'number' ? templateId : null,
    titlePattern: titlePattern?.slice(0, 255) ?? null,
    description: description?.slice(0, 5000) ?? null,
    cadence,
    dayOfWeek: cfg.dayOfWeek,
    dayOfMonth: cfg.dayOfMonth,
    hourUtc: hour,
    nextFireAt: nextFire,
    createdBy: access.userId,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
