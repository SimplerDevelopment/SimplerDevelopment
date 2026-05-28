// Publishing Command Center — permissions list.
//
// GET /api/portal/publishing/permissions
//
// Returns:
//   - members: every client_members row for this client (with user name/email
//     + role), excluding the requesting user (you can't manage your own perms).
//   - grants:  every per-row explicit grant in publishing_permissions.
//
// Gated to owners + admins + staff.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientMembers, users, publishingPermissions } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { getPublishingSession } from '@/lib/publishing/active-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getPublishingSession();
    const canManage =
      session.isStaff || session.role === 'owner' || session.role === 'admin';
    if (!canManage) {
      return NextResponse.json({ success: false, message: 'forbidden' }, { status: 403 });
    }

    const members = await db
      .select({
        userId: clientMembers.userId,
        name: users.name,
        email: users.email,
        role: clientMembers.role,
      })
      .from(clientMembers)
      .innerJoin(users, eq(users.id, clientMembers.userId))
      .where(and(eq(clientMembers.clientId, session.clientId), ne(clientMembers.userId, session.userId)));

    const grants = await db
      .select({
        userId: publishingPermissions.userId,
        permissionKey: publishingPermissions.permissionKey,
      })
      .from(publishingPermissions)
      .where(eq(publishingPermissions.clientId, session.clientId));

    return NextResponse.json({
      success: true,
      data: {
        members,
        grants,
        currentUserId: session.userId,
        currentUserIsOwner: session.role === 'owner',
      },
    });
  } catch (error) {
    console.error('publishing permissions GET failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load permissions' },
      { status: 500 },
    );
  }
}
