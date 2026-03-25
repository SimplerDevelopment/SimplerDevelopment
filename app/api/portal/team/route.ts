import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, clients, clientMembers } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';

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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const currentRole = await getUserRole(userId, client);

  const members = await db
    .select({
      memberId: clientMembers.id,
      role: clientMembers.role,
      joinedAt: clientMembers.createdAt,
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(clientMembers)
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(eq(clientMembers.clientId, client.id))
    .orderBy(clientMembers.createdAt);

  const data = members.map(m => ({
    ...m,
    isOwner: m.role === 'owner' || m.userId === client.userId,
    isCurrentUser: m.userId === userId,
  }));

  // Include primary owner even without clientMembers row
  const primaryOwnerInList = data.some(m => m.userId === client.userId);
  if (!primaryOwnerInList && client.userId) {
    const [ownerUser] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, client.userId)).limit(1);
    if (ownerUser) {
      data.unshift({
        memberId: 0,
        role: 'owner',
        joinedAt: client.createdAt,
        userId: ownerUser.id,
        name: ownerUser.name,
        email: ownerUser.email,
        isOwner: true,
        isCurrentUser: ownerUser.id === userId,
      });
    }
  }

  return NextResponse.json({ success: true, data, currentRole });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const currentRole = await getUserRole(userId, client);
  if (currentRole !== 'owner' && currentRole !== 'admin') {
    return NextResponse.json({ success: false, message: 'Only owners and admins can invite members' }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, role } = body;
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ success: false, message: 'Name and email are required' }, { status: 400 });
  }

  const assignRole = VALID_ROLES.includes(role) ? role : 'member';

  // Admins can't invite other admins
  if (currentRole === 'admin' && assignRole === 'admin') {
    return NextResponse.json({ success: false, message: 'Only owners can assign the admin role' }, { status: 403 });
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email.trim())).limit(1);
  const tempPassword = randomBytes(6).toString('hex');

  let invitedUser = existing;
  if (!invitedUser) {
    const hashed = await hash(tempPassword, 12);
    [invitedUser] = await db.insert(users).values({
      name: name.trim(),
      email: email.trim(),
      password: hashed,
      role: 'client',
      active: true,
    }).returning();
  }

  const [alreadyMember] = await db
    .select()
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, invitedUser.id)))
    .limit(1);
  if (alreadyMember) {
    return NextResponse.json({ success: false, message: 'User is already a team member' }, { status: 400 });
  }

  const [member] = await db.insert(clientMembers).values({
    clientId: client.id,
    userId: invitedUser.id,
    role: assignRole,
    invitedBy: userId,
  }).returning();

  return NextResponse.json({
    success: true,
    data: {
      ...member,
      name: invitedUser.name,
      email: invitedUser.email,
      isNewUser: !existing,
      tempPassword: !existing ? tempPassword : null,
    },
  }, { status: 201 });
}
