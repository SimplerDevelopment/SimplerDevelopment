// Publishing Command Center — permission resolution.
//
// Default posture (no rows in publishing_permissions):
//   - Owners + admins (client_members.role in {'owner', 'admin'}): every key
//     implicitly granted.
//   - Staff (admin/employee on simplerdev itself): every key implicitly granted
//     for any client they have an active session against.
//   - Everyone else: every key implicitly denied (view-only board access).
//
// Per-row overrides flip a single key for a single user. The override always
// wins over the default; deny-via-row is conceptually allowed but the current
// UI only ever inserts grants (delete a row to revert). The `manage_permissions`
// key is owner-only — staff and admins cannot grant it.

import { db } from '@/lib/db';
import { publishingPermissions, clientMembers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { PUBLISHING_PERMISSION_KEYS, type PublishingPermissionKey } from './constants';

export type PublishingRoleContext = {
  /** The user being checked. */
  userId: number;
  /** The client (tenant) the action targets. */
  clientId: number;
  /** True if this user is on the simplerdev staff side (admin/employee role
   *  on the `users` table). Resolved by the caller from the session. */
  isStaff: boolean;
};

/** Resolves whether a user can perform a single permission key against the
 *  given client. Returns `{ granted: true, reason }` or `{ granted: false, reason }`. */
export async function checkPublishingPermission(
  ctx: PublishingRoleContext,
  key: PublishingPermissionKey,
): Promise<{ granted: boolean; reason: string }> {
  if (ctx.isStaff) return { granted: true, reason: 'staff' };

  const role = await resolveClientRole(ctx.userId, ctx.clientId);
  if (role === 'owner' || role === 'admin') {
    return { granted: true, reason: `role:${role}` };
  }

  const row = await db
    .select({ id: publishingPermissions.id })
    .from(publishingPermissions)
    .where(
      and(
        eq(publishingPermissions.clientId, ctx.clientId),
        eq(publishingPermissions.userId, ctx.userId),
        eq(publishingPermissions.permissionKey, key),
      ),
    )
    .limit(1);
  if (row.length > 0) return { granted: true, reason: 'explicit_grant' };

  return { granted: false, reason: role ? `role:${role}` : 'no_membership' };
}

/** Returns the role of `userId` against `clientId` per `client_members`, or
 *  null if no membership exists. Owner > admin > member > viewer. */
export async function resolveClientRole(
  userId: number,
  clientId: number,
): Promise<'owner' | 'admin' | 'member' | 'viewer' | null> {
  const rows = await db
    .select({ role: clientMembers.role })
    .from(clientMembers)
    .where(and(eq(clientMembers.userId, userId), eq(clientMembers.clientId, clientId)))
    .limit(1);
  if (rows.length === 0) return null;
  const role = rows[0].role;
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') {
    return role;
  }
  return null;
}

/** Lists every (userId, key) grant for the given client. Returns one row per
 *  granted user-permission pair. Owners/admins/staff get an empty list (their
 *  grants are implicit). */
export async function listExplicitGrants(clientId: number): Promise<
  Array<{ userId: number; userName: string; userEmail: string; permissionKey: string; createdAt: Date }>
> {
  const rows = await db
    .select({
      userId: publishingPermissions.userId,
      userName: users.name,
      userEmail: users.email,
      permissionKey: publishingPermissions.permissionKey,
      createdAt: publishingPermissions.createdAt,
    })
    .from(publishingPermissions)
    .innerJoin(users, eq(users.id, publishingPermissions.userId))
    .where(eq(publishingPermissions.clientId, clientId));
  return rows.map((r) => ({
    userId: r.userId,
    userName: r.userName ?? '',
    userEmail: r.userEmail ?? '',
    permissionKey: r.permissionKey,
    createdAt: r.createdAt,
  }));
}

/** Inserts a permission grant. Idempotent — returns false if the grant
 *  already existed. Throws if `key` is not a recognized permission key. */
export async function grantPublishingPermission(
  clientId: number,
  userId: number,
  key: string,
  grantedByUserId: number,
): Promise<boolean> {
  assertKnownKey(key);
  const existing = await db
    .select({ id: publishingPermissions.id })
    .from(publishingPermissions)
    .where(
      and(
        eq(publishingPermissions.clientId, clientId),
        eq(publishingPermissions.userId, userId),
        eq(publishingPermissions.permissionKey, key),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;
  await db.insert(publishingPermissions).values({
    clientId,
    userId,
    permissionKey: key,
    grantedBy: grantedByUserId,
  });
  return true;
}

/** Removes a permission grant. Idempotent — returns false if no grant existed. */
export async function revokePublishingPermission(
  clientId: number,
  userId: number,
  key: string,
): Promise<boolean> {
  assertKnownKey(key);
  const deleted = await db
    .delete(publishingPermissions)
    .where(
      and(
        eq(publishingPermissions.clientId, clientId),
        eq(publishingPermissions.userId, userId),
        eq(publishingPermissions.permissionKey, key),
      ),
    )
    .returning({ id: publishingPermissions.id });
  return deleted.length > 0;
}

function assertKnownKey(key: string): asserts key is PublishingPermissionKey {
  if (!(PUBLISHING_PERMISSION_KEYS as readonly string[]).includes(key)) {
    throw new Error(`unknown publishing permission key: ${key}`);
  }
}
