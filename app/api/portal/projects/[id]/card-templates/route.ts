// Card-template CRUD scoped to one project. Project members read; editors+
// can create/update/delete project-scoped templates. Client-wide templates
// (projectId=null) are surfaced too via the GET so the picker shows them.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cardTemplates, projects } from '@/lib/db/schema';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  if (!(await isPortalStaff())) {
    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
  }

  // Visible templates: project-scoped + client-wide for the project's tenancy.
  const rows = await db.select().from(cardTemplates)
    .where(and(
      eq(cardTemplates.clientId, project.clientId),
      or(eq(cardTemplates.projectId, projectId), isNull(cardTemplates.projectId)),
    ))
    .orderBy(asc(cardTemplates.name));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (!(await canUserEditProject(userId, projectId))) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
  }

  const body = await req.json();
  const { name, description, payload, clientWide } = body as {
    name?: string;
    description?: string;
    payload?: Record<string, unknown>;
    clientWide?: boolean;
  };
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });

  const [row] = await db.insert(cardTemplates).values({
    clientId: project.clientId,
    projectId: clientWide ? null : projectId,
    name: name.trim().slice(0, 100),
    description: description?.slice(0, 5000) ?? null,
    payload: (payload ?? {}) as typeof cardTemplates.$inferInsert['payload'],
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
