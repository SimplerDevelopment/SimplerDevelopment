import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientMembers } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  // Only the owner can remove members
  const isOwner = client.userId === userId;
  if (!isOwner) {
    const [ownerMember] = await db
      .select()
      .from(clientMembers)
      .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, userId), eq(clientMembers.role, 'owner')))
      .limit(1);
    if (!ownerMember) return NextResponse.json({ success: false, message: 'Only the account owner can remove members' }, { status: 403 });
  }

  const { memberId } = await params;
  const memberIdInt = parseInt(memberId, 10);

  const [member] = await db
    .select()
    .from(clientMembers)
    .where(and(eq(clientMembers.id, memberIdInt), eq(clientMembers.clientId, client.id)))
    .limit(1);
  if (!member) return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

  // Can't remove yourself
  if (member.userId === userId) {
    return NextResponse.json({ success: false, message: 'You cannot remove yourself' }, { status: 400 });
  }

  await db.delete(clientMembers).where(eq(clientMembers.id, memberIdInt));

  return NextResponse.json({ success: true, message: 'Member removed' });
}
