import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectMembers, projects, users, clientMembers, clients } from '@/lib/db/schema';
import { and, eq, asc, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { ROLE_OPTIONS, type ProjectRole } from '@/lib/portal/project-permissions';

async function authorizeOwnerAccess(projectId: number, session: { user?: { id?: string; role?: string } } | null) {
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  if (staff) return { project, userId, isOwnerOrStaff: true };

  const client = await getPortalClient(userId);
  if (!client || client.id !== project.clientId) return null;

  const [member] = await db.select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return { project, userId, isOwnerOrStaff: member?.role === 'owner' };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);

  // Membership listing requires read access on the project (any role).
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  if (!staff) {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const rows = await db
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      role: projectMembers.role,
      addedAt: projectMembers.addedAt,
      name: users.name,
      email: users.email,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const projectId = parseInt(id, 10);

  const access = await authorizeOwnerAccess(projectId, session);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.isOwnerOrStaff) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { userId: targetUserId, role } = body;
  if (typeof targetUserId !== 'number' || !ROLE_OPTIONS.includes(role)) {
    return NextResponse.json({ success: false, message: 'userId and a valid role are required' }, { status: 400 });
  }

  // Only users who already belong to the project's client tenancy can be added.
  // Staff (admin/employee) are always eligible because their tenancy is global.
  // Stops a project owner from adding any random portal user as a member.
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

  const targetIsStaff = target.role === 'admin' || target.role === 'employee';
  if (!targetIsStaff) {
    const tenancyRows = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(clientMembers, and(eq(clientMembers.userId, users.id), eq(clientMembers.clientId, access.project.clientId)))
      .leftJoin(clients, and(eq(clients.userId, users.id), eq(clients.id, access.project.clientId)))
      .where(and(eq(users.id, targetUserId), or(eq(clientMembers.clientId, access.project.clientId), eq(clients.id, access.project.clientId))))
      .limit(1);
    if (tenancyRows.length === 0) {
      return NextResponse.json({ success: false, message: 'User is not part of this client account' }, { status: 403 });
    }
  }

  const [row] = await db.insert(projectMembers).values({
    projectId,
    userId: targetUserId,
    role: role as ProjectRole,
    addedBy: access.userId,
  }).onConflictDoUpdate({
    target: [projectMembers.projectId, projectMembers.userId],
    set: { role: role as ProjectRole, addedBy: access.userId },
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const projectId = parseInt(id, 10);

  const access = await authorizeOwnerAccess(projectId, session);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.isOwnerOrStaff) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { userId: targetUserId, role } = body;
  if (typeof targetUserId !== 'number' || !ROLE_OPTIONS.includes(role)) {
    return NextResponse.json({ success: false, message: 'userId and a valid role are required' }, { status: 400 });
  }

  // Owners cannot demote themselves while they're the sole owner — would orphan the project.
  if (targetUserId === access.userId && role !== 'owner') {
    const owners = await db.select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
    if (owners.length <= 1) {
      return NextResponse.json({ success: false, message: 'Cannot demote the sole owner; promote another member first' }, { status: 409 });
    }
  }

  const [row] = await db.update(projectMembers)
    .set({ role: role as ProjectRole })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUserId)))
    .returning();
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const projectId = parseInt(id, 10);

  const access = await authorizeOwnerAccess(projectId, session);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.isOwnerOrStaff) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const removeUserId = parseInt(url.searchParams.get('userId') ?? '', 10);
  if (Number.isNaN(removeUserId)) return NextResponse.json({ success: false, message: 'userId query param required' }, { status: 400 });

  // Same orphan guard as PATCH — last owner cannot leave.
  const [target] = await db.select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, removeUserId)))
    .limit(1);
  if (!target) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (target.role === 'owner') {
    const owners = await db.select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
    if (owners.length <= 1) {
      return NextResponse.json({ success: false, message: 'Cannot remove the sole owner; promote another member first' }, { status: 409 });
    }
  }

  await db.delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, removeUserId)));

  return NextResponse.json({ success: true });
}
