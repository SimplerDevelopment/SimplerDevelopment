import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectMembers, kanbanColumns, kanbanLabels, cardTemplates } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { emitEvent } from '@/lib/automation';
import type { ProjectRole } from '@/lib/portal/project-permissions';
import { revalidateAdminDashboard } from '@/lib/admin/dashboard-cache';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const all = await db.select().from(projects).where(eq(projects.clientId, client.id)).orderBy(projects.createdAt);

  // Decorate each project with the caller's role. Staff resolve to owner without
  // needing a member row; non-staff see only projects where they have a row.
  let decorated: Array<typeof projects.$inferSelect & { myRole: ProjectRole }>;
  if (staff) {
    decorated = all.map(p => ({ ...p, myRole: 'owner' as ProjectRole }));
  } else {
    const ids = all.map(p => p.id);
    const memberships = ids.length === 0
      ? []
      : await db.select({ projectId: projectMembers.projectId, role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, ids)));
    const roleByProject = new Map(memberships.map(m => [m.projectId, m.role as ProjectRole]));
    decorated = all
      .filter(p => roleByProject.has(p.id))
      .map(p => ({ ...p, myRole: roleByProject.get(p.id)! }));
  }

  return NextResponse.json({
    success: true,
    data: decorated,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const { name, description, status, startDate, dueDate, cloneFromProjectId } = body;

  if (!name) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const allowedStatuses = ['active', 'paused', 'completed', 'archived'];
  const projectStatus = typeof status === 'string' && allowedStatuses.includes(status) ? status : 'active';

  // Short project key: first 4 alnum chars of the name, uppercase, suffixed
  // with the row id once it exists. PRJ fallback for symbol-only names.
  const basePrefix = (name as string).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRJ';

  // If cloneFromProjectId is supplied, verify the source belongs to the same
  // client tenancy before doing any work — prevents cross-tenant copies.
  let source: typeof projects.$inferSelect | null = null;
  if (typeof cloneFromProjectId === 'number') {
    const [src] = await db.select().from(projects)
      .where(and(eq(projects.id, cloneFromProjectId), eq(projects.clientId, client.id)))
      .limit(1);
    if (!src) return NextResponse.json({ success: false, message: 'Source project not found in this account' }, { status: 404 });
    source = src;
  }

  const [project] = await db.insert(projects).values({
    name,
    description: description || null,
    clientId: client.id,
    status: projectStatus,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    createdBy: userId,
  }).returning();

  await db.update(projects)
    .set({ projectKey: `${basePrefix}${project.id}` })
    .where(eq(projects.id, project.id));
  project.projectKey = `${basePrefix}${project.id}`;

  // Creator becomes owner. Staff users still get a row so they appear in the
  // members list; their implicit-owner status is a runtime fact, not stored.
  await db.insert(projectMembers).values({
    projectId: project.id,
    userId,
    role: 'owner',
    addedBy: userId,
  }).onConflictDoNothing();

  // Clone phase: columns + labels + project-scoped card templates from the
  // source project. Cards intentionally NOT cloned — the source is meant as
  // a structural starting point, not a content snapshot.
  if (source) {
    const srcColumns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, source.id));
    if (srcColumns.length > 0) {
      await db.insert(kanbanColumns).values(srcColumns.map(c => ({
        projectId: project.id,
        name: c.name,
        order: c.order,
        color: c.color,
        isDone: c.isDone,
        wipLimit: c.wipLimit,
      })));
    }
    const srcLabels = await db.select().from(kanbanLabels).where(eq(kanbanLabels.projectId, source.id));
    if (srcLabels.length > 0) {
      await db.insert(kanbanLabels).values(srcLabels.map(l => ({
        projectId: project.id,
        name: l.name,
        color: l.color,
      })));
    }
    const srcTemplates = await db.select().from(cardTemplates).where(eq(cardTemplates.projectId, source.id));
    if (srcTemplates.length > 0) {
      await db.insert(cardTemplates).values(srcTemplates.map(t => ({
        clientId: client.id,
        projectId: project.id,
        name: t.name,
        description: t.description,
        payload: t.payload,
        createdBy: userId,
      })));
    }
  }

  emitEvent('project.created', client.id, userId, { id: project.id, name: project.name, status: project.status, clonedFrom: source?.id ?? null });

  // E2 — invalidate the admin dashboard cache (active-project count bumped).
  revalidateAdminDashboard();

  return NextResponse.json({ success: true, data: { ...project, myRole: 'owner' as ProjectRole } }, { status: 201 });
}
