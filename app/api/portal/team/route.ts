import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, clients, clientMembers } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sendInviteEmail } from '@/lib/email/invite-email';
import { hashToken } from '@/lib/security/token-hash';

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

  // Raw token is emailed to the recipient; only the SHA-256 hash is stored.
  // A read-only DB compromise can't be used to take over pending invites.
  const rawInviteToken = randomBytes(32).toString('hex');
  const inviteTokenHash = hashToken(rawInviteToken);
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  let invitedUser = existing;
  let isNewUser = false;
  if (!invitedUser) {
    // Create user with a placeholder password — they'll set their real password via the invite link
    const placeholder = await hash(randomBytes(32).toString('hex'), 12);
    [invitedUser] = await db.insert(users).values({
      name: name.trim(),
      email: email.trim(),
      password: placeholder,
      role: 'client',
      active: true,
      inviteToken: inviteTokenHash,
      inviteExpiresAt,
    }).returning();
    isNewUser = true;
  } else {
    // Existing user — set invite token so they can also use the link (optional convenience)
    await db.update(users).set({ inviteToken: inviteTokenHash, inviteExpiresAt }).where(eq(users.id, invitedUser.id));
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

  // Send invite email
  const inviterName = session.user.name || 'A team member';
  try {
    await sendInviteEmail({
      recipientEmail: invitedUser.email,
      recipientName: invitedUser.name,
      companyName: client.company || 'Your Team',
      inviterName,
      role: assignRole,
      inviteToken: rawInviteToken,
    });
  } catch (emailError) {
    console.error('Failed to send invite email:', emailError);
    // Don't fail the invite if email fails — user was still added
  }

  return NextResponse.json({
    success: true,
    data: {
      ...member,
      name: invitedUser.name,
      email: invitedUser.email,
      isNewUser,
      inviteSent: true,
    },
  }, { status: 201 });
}
