// Publishing Command Center — per-user permissions matrix.
//
// Gate: owners + admins + simplerdev staff. Anyone else is redirected to the
// board. Inside the page we fetch the client's members + every explicit grant
// row directly, then hand both to PermissionMatrix.

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { clientMembers, users, publishingPermissions } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { getPublishingSession } from '@/lib/publishing/active-client';
import PermissionMatrix, {
  type PermissionMatrixMember,
} from '@/components/portal/publishing/PermissionMatrix';

export const dynamic = 'force-dynamic';

type ClientRole = PermissionMatrixMember['role'];

const ROLES: readonly ClientRole[] = ['owner', 'admin', 'member', 'viewer'];

function coerceRole(raw: string): ClientRole {
  return (ROLES as readonly string[]).includes(raw) ? (raw as ClientRole) : 'viewer';
}

export default async function PublishingPermissionsPage() {
  const session = await getPublishingSession();
  const canManage =
    session.isStaff || session.role === 'owner' || session.role === 'admin';
  if (!canManage) redirect('/portal/publishing/board');

  // Pull every member of this client other than the current user (you can't
  // manage your own permissions). Drizzle returns role as varchar; we narrow
  // it via coerceRole so the matrix-side enum is preserved.
  const memberRows = await db
    .select({
      userId: clientMembers.userId,
      name: users.name,
      email: users.email,
      role: clientMembers.role,
    })
    .from(clientMembers)
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(
      and(eq(clientMembers.clientId, session.clientId), ne(clientMembers.userId, session.userId)),
    );

  const members: PermissionMatrixMember[] = memberRows.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: coerceRole(m.role),
  }));

  // Split owners/admins out — they appear in a separate transparency section.
  const matrixMembers = members.filter((m) => m.role !== 'owner' && m.role !== 'admin');
  const ownersAndAdmins = members.filter((m) => m.role === 'owner' || m.role === 'admin');

  const grants = await db
    .select({
      userId: publishingPermissions.userId,
      permissionKey: publishingPermissions.permissionKey,
    })
    .from(publishingPermissions)
    .where(eq(publishingPermissions.clientId, session.clientId));

  const canGrantManagePermissions = session.isStaff || session.role === 'owner';

  return (
    <PermissionMatrix
      members={matrixMembers}
      ownersAndAdmins={ownersAndAdmins}
      initialGrants={grants}
      canGrantManagePermissions={canGrantManagePermissions}
    />
  );
}
