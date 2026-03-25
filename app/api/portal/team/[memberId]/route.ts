import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientMembers } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

const VALID_ROLES = ['admin', 'member', 'viewer'] as const;

async function getUserRole(userId: number, client: { id: number; userId: number | null }) {
  if (client.userId === userId) return 'owner';
  const [row] = await db
    .select({ role: clientMembers.role })
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const currentRole = await getUserRole(userId, client);
  if (currentRole !== 'owner' && currentRole !== 'admin') {
    return NextResponse.json({ success: false, message: 'Only owners and admins can update roles' }, { status: 403 });
  }

  const { memberId } = await params;
  const memberIdInt = parseInt(memberId, 10);

  const [member] = await db
    .select()
    .from(clientMembers)
    .where(and(eq(clientMembers.id, memberIdInt), eq(clientMembers.clientId, client.id)))
    .limit(1);
  if (!member) return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

  // Can't change own role
  if (member.userId === userId) {
    return NextResponse.json({ success: false, message: 'You cannot change your own role' }, { status: 400 });
  }

  // Can't change owner role
  if (member.role === 'owner' || member.userId === client.userId) {
    return NextResponse.json({ success: false, message: 'Cannot change the owner role' }, { status: 403 });
  }

  const body = await req.json();
  const { role } = body;

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ success: false, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  // Admins can't promote to admin
  if (currentRole === 'admin' && role === 'admin') {
    return NextResponse.json({ success: false, message: 'Only owners can assign the admin role' }, { status: 403 });
  }

  await db.update(clientMembers).set({ role }).where(eq(clientMembers.id, memberIdInt));

  return NextResponse.json({ success: true, message: 'Role updated' });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const currentRole = await getUserRole(userId, client);
  if (currentRole !== 'owner' && currentRole !== 'admin') {
    return NextResponse.json({ success: false, message: 'Only owners and admins can remove members' }, { status: 403 });
  }

  const { memberId } = await params;
  const memberIdInt = parseInt(memberId, 10);

  const [member] = await db
    .select()
    .from(clientMembers)
    .where(and(eq(clientMembers.id, memberIdInt), eq(clientMembers.clientId, client.id)))
    .limit(1);
  if (!member) return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

  if (member.userId === userId) {
    return NextResponse.json({ success: false, message: 'You cannot remove yourself' }, { status: 400 });
  }

  // Can't remove owner
  if (member.role === 'owner' || member.userId === client.userId) {
    return NextResponse.json({ success: false, message: 'Cannot remove the account owner' }, { status: 403 });
  }

  // Admins can't remove other admins
  if (currentRole === 'admin' && member.role === 'admin') {
    return NextResponse.json({ success: false, message: 'Only owners can remove admins' }, { status: 403 });
  }

  await db.delete(clientMembers).where(eq(clientMembers.id, memberIdInt));

  return NextResponse.json({ success: true, message: 'Member removed' });
}
