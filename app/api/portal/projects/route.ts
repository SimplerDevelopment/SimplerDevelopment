import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectMembers } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { emitEvent } from '@/lib/automation';
import type { ProjectRole } from '@/lib/portal/project-permissions';

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
  const { name, description, status, startDate, dueDate } = body;

  if (!name) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const allowedStatuses = ['active', 'paused', 'completed', 'archived'];
  const projectStatus = typeof status === 'string' && allowedStatuses.includes(status) ? status : 'active';

  // Short project key: first 4 alnum chars of the name, uppercase, suffixed
  // with the row id once it exists. PRJ fallback for symbol-only names.
  const basePrefix = (name as string).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRJ';

  const [project] = await db.insert(projects).values({
    name,
    description: description || null,
    clientId: client.id,
    status: projectStatus,
    // isPrivate retained for back-compat; new permission gates ignore it.
    isPrivate: true,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    createdBy: userId,
  }).returning();

  await db.update(projects)
    .set({ projectKey: `${basePrefix}${project.id}` })
    .where(eq(projects.id, project.id));
  project.projectKey = `${basePrefix}${project.id}`;

  // The creator becomes the project owner. Staff users still get a row so they
  // appear in the members list — their implicit-owner status is a runtime fact,
  // not a stored one, but explicit membership keeps audit trails meaningful.
  await db.insert(projectMembers).values({
    projectId: project.id,
    userId,
    role: 'owner',
    addedBy: userId,
  }).onConflictDoNothing();

  emitEvent('project.created', client.id, userId, { id: project.id, name: project.name, status: project.status });

  return NextResponse.json({ success: true, data: { ...project, myRole: 'owner' as ProjectRole } }, { status: 201 });
}
