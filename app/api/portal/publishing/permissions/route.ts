// Publishing Command Center — permissions matrix data feed.
//
// GET returns the set of member-role users for the active client (plus the
// owner/admin list, surfaced separately so the UI can show implicit grants
// for transparency) and every explicit publishing_permissions row for the
// client. Gated to owners / admins / staff — the same audience that can see
// the matrix page itself.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, clients, clientMembers, publishingPermissions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPublishingSession } from '@/lib/publishing/active-client';

export const dynamic = 'force-dynamic';

type MatrixMember = {
  userId: number;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const publishing = await getPublishingSession();
  const canManage =
    publishing.isStaff ||
    publishing.role === 'owner' ||
    publishing.role === 'admin';
  if (!canManage) {
    return NextResponse.json(
      { success: false, message: 'Forbidden' },
      { status: 403 },
    );
  }

  const clientId = publishing.clientId;
  const callerUserId = publishing.userId;

  // Pull every user with access to this client: anyone in client_members PLUS
  // the primary owner on clients.userId (who may not have an explicit row).
  const [clientRow] = await db
    .select({ id: clients.id, userId: clients.userId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const memberRows = await db
    .select({
      userId: clientMembers.userId,
      role: clientMembers.role,
      name: users.name,
      email: users.email,
    })
    .from(clientMembers)
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(eq(clientMembers.clientId, clientId));

  const collected = new Map<number, MatrixMember>();
  for (const row of memberRows) {
    const role = normalizeRole(row.role);
    if (!role) continue;
    collected.set(row.userId, {
      userId: row.userId,
      name: row.name ?? '',
      email: row.email ?? '',
      role,
    });
  }

  // Make sure the primary owner shows up even without a client_members row.
  if (clientRow?.userId && !collected.has(clientRow.userId)) {
    const [primary] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, clientRow.userId))
      .limit(1);
    if (primary) {
      collected.set(primary.id, {
        userId: primary.id,
        name: primary.name ?? '',
        email: primary.email ?? '',
        role: 'owner',
      });
    }
  }

  // Promote the primary owner's role to 'owner' even if their client_members
  // row says something else.
  if (clientRow?.userId && collected.has(clientRow.userId)) {
    const existing = collected.get(clientRow.userId)!;
    collected.set(clientRow.userId, { ...existing, role: 'owner' });
  }

  const everyone = Array.from(collected.values()).sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email),
  );

  // Matrix rows = member-role users (not the caller). Owners + admins get
  // implicit everything and render in a separate "Owners & admins" section.
  const matrixMembers = everyone.filter(
    (m) => m.userId !== callerUserId && m.role !== 'owner' && m.role !== 'admin',
  );
  const ownersAndAdmins = everyone.filter(
    (m) => m.role === 'owner' || m.role === 'admin',
  );

  // Explicit grants for this client. Keep it lean — the matrix only needs
  // (userId, permissionKey) tuples; the page's existing list view can call
  // listExplicitGrants() if it wants richer metadata.
  const grantRows = await db
    .select({
      userId: publishingPermissions.userId,
      permissionKey: publishingPermissions.permissionKey,
    })
    .from(publishingPermissions)
    .where(eq(publishingPermissions.clientId, clientId));

  return NextResponse.json({
    success: true,
    data: {
      members: matrixMembers,
      ownersAndAdmins,
      grants: grantRows,
    },
  });
}

function normalizeRole(role: string | null | undefined): MatrixMember['role'] | null {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') {
    return role;
  }
  return null;
}

