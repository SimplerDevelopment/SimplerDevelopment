// Saved views CRUD for the kanban board / backlog / reports surfaces.
// Per-user views (userId set) are private; project-wide views (userId null)
// are visible to every member and editable by editors+.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectSavedViews, projects } from '@/lib/db/schema';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

type Scope = 'backlog' | 'board' | 'reports';

async function authorizeProject(projectId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  if (staff) return { userId, project, canEdit: true };

  const client = await getPortalClient(userId);
  if (!client || client.id !== project.clientId) return null;

  const canEdit = await canUserEditProject(userId, projectId);
  return { userId, project, canEdit };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorizeProject(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const scopeFilter = url.searchParams.get('scope');

  // The caller sees: their own private views + every shared view on this project.
  const baseWhere = and(
    eq(projectSavedViews.projectId, projectId),
    or(eq(projectSavedViews.userId, access.userId), isNull(projectSavedViews.userId)),
  );
  const where = scopeFilter
    ? and(baseWhere, eq(projectSavedViews.scope, scopeFilter))
    : baseWhere;

  const rows = await db.select().from(projectSavedViews)
    .where(where)
    .orderBy(asc(projectSavedViews.scope), asc(projectSavedViews.name));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorizeProject(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, scope, filterJson, shared } = body as {
    name?: string;
    scope?: Scope;
    filterJson?: Record<string, unknown>;
    shared?: boolean;
  };
  if (!name?.trim() || !scope || !['backlog', 'board', 'reports'].includes(scope)) {
    return NextResponse.json({ success: false, message: 'name and a valid scope are required' }, { status: 400 });
  }
  // Sharing a view (userId=null) requires editor+ — viewers can save private views only.
  if (shared && !access.canEdit) {
    return NextResponse.json({ success: false, message: 'Only editors can save shared views' }, { status: 403 });
  }

  const [row] = await db.insert(projectSavedViews).values({
    projectId,
    userId: shared ? null : access.userId,
    scope,
    name: name.trim().slice(0, 100),
    filterJson: filterJson ?? {},
    createdBy: access.userId,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
