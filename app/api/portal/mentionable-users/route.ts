import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, clientMembers } from '@/lib/db/schema';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);

    // Agency staff are always mentionable (clients @mention their team; staff @mention each other).
    // Plus: every member of the caller's currently active client.
    let memberIds: number[] = [];
    if (client) {
      const members = await db
        .select({ userId: clientMembers.userId })
        .from(clientMembers)
        .where(eq(clientMembers.clientId, client.id));
      memberIds = members.map(m => m.userId);
    }

    const staffFilter = or(eq(users.role, 'admin'), eq(users.role, 'employee'));
    const whereClause = memberIds.length > 0
      ? and(eq(users.active, true), or(staffFilter, inArray(users.id, memberIds)))
      : and(eq(users.active, true), staffFilter);

    const data = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(whereClause)
      .orderBy(asc(users.name));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[GET /api/portal/mentionable-users]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
