import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, clients, clientMembers } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

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

  // Determine owner: clientMembers.role='owner' OR clients.userId match
  const data = members.map(m => ({
    ...m,
    isOwner: m.role === 'owner' || m.userId === client.userId,
    isCurrentUser: m.userId === userId,
  }));

  // Include the primary owner (clients.userId) even if they have no clientMembers row
  const primaryOwnerInList = data.some(m => m.userId === client.userId);
  if (!primaryOwnerInList && client.userId) {
    const [ownerUser] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, client.userId)).limit(1);
    if (ownerUser) {
      data.unshift({
        memberId: 0, // virtual — no clientMembers row
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

  const isOwner = client.userId === userId || data.some(m => m.isCurrentUser && m.isOwner);

  return NextResponse.json({ success: true, data, isOwner });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  // Only the owner can invite
  const isOwner = client.userId === userId;
  if (!isOwner) {
    const [ownerMember] = await db
      .select()
      .from(clientMembers)
      .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, userId), eq(clientMembers.role, 'owner')))
      .limit(1);
    if (!ownerMember) return NextResponse.json({ success: false, message: 'Only the account owner can invite members' }, { status: 403 });
  }

  const body = await req.json();
  const { name, email } = body;
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ success: false, message: 'Name and email are required' }, { status: 400 });
  }

  // Find or create user
  const [existing] = await db.select().from(users).where(eq(users.email, email.trim())).limit(1);
  const tempPassword = randomBytes(6).toString('hex'); // 12 char hex

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

  // Check already a member
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
    role: 'member',
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
