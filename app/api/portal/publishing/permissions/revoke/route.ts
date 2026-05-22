// Publishing Command Center — revoke a single publishing permission from a
// single user on the active client.
//
// POST { userId, permissionKey }
//   200 { success: true, data: { revoked: boolean } }
//
// Gating mirrors /grant: owners always; admins gated on `manage_permissions`.
// Revoking `manage_permissions` itself can only be done by an owner.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPublishingSession } from '@/lib/publishing/active-client';
import {
  checkPublishingPermission,
  revokePublishingPermission,
} from '@/lib/publishing/permissions';
import {
  PUBLISHING_PERMISSION_KEYS,
  type PublishingPermissionKey,
} from '@/lib/publishing/constants';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const publishing = await getPublishingSession();

  let body: { userId?: unknown; permissionKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const targetUserId =
    typeof body.userId === 'number'
      ? body.userId
      : typeof body.userId === 'string'
        ? parseInt(body.userId, 10)
        : NaN;
  const permissionKey = typeof body.permissionKey === 'string' ? body.permissionKey : '';

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return NextResponse.json(
      { success: false, message: 'userId is required' },
      { status: 400 },
    );
  }
  if (!(PUBLISHING_PERMISSION_KEYS as readonly string[]).includes(permissionKey)) {
    return NextResponse.json(
      { success: false, message: `Unknown permission key: ${permissionKey}` },
      { status: 400 },
    );
  }

  if (targetUserId === publishing.userId) {
    return NextResponse.json(
      { success: false, message: 'Cannot manage your own permissions' },
      { status: 400 },
    );
  }

  const isOwner = publishing.role === 'owner';
  if (!isOwner && !publishing.isStaff) {
    const allowed = await checkPublishingPermission(
      { userId: publishing.userId, clientId: publishing.clientId, isStaff: false },
      'manage_permissions',
    );
    if (!allowed.granted) {
      return NextResponse.json(
        { success: false, message: 'Forbidden' },
        { status: 403 },
      );
    }
  }

  if (permissionKey === 'manage_permissions' && !isOwner) {
    return NextResponse.json(
      { success: false, message: 'Only owners can revoke manage_permissions' },
      { status: 403 },
    );
  }

  const revoked = await revokePublishingPermission(
    publishing.clientId,
    targetUserId,
    permissionKey as PublishingPermissionKey,
  );

  return NextResponse.json({
    success: true,
    data: {
      userId: targetUserId,
      permissionKey,
      revoked,
    },
  });
}
