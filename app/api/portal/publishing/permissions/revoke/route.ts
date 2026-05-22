import { NextRequest, NextResponse } from 'next/server';
import { getPublishingSession } from '@/lib/publishing/active-client';
import {
  revokePublishingPermission,
  checkPublishingPermission,
} from '@/lib/publishing/permissions';
import { PUBLISHING_PERMISSION_KEYS } from '@/lib/publishing/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getPublishingSession();
    const ctx = { userId: session.userId, clientId: session.clientId, isStaff: session.isStaff };
    const perm = await checkPublishingPermission(ctx, 'manage_permissions');
    if (!perm.granted) {
      return NextResponse.json(
        { success: false, message: `forbidden (${perm.reason})` },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'invalid body' }, { status: 400 });
    }
    const userId = Number(body.userId);
    const key = typeof body.permissionKey === 'string' ? body.permissionKey : '';
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ success: false, message: 'userId required' }, { status: 400 });
    }
    if (!(PUBLISHING_PERMISSION_KEYS as readonly string[]).includes(key)) {
      return NextResponse.json({ success: false, message: 'unknown permissionKey' }, { status: 400 });
    }
    if (key === 'manage_permissions' && !session.isStaff && session.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Only owners can revoke manage_permissions' },
        { status: 403 },
      );
    }

    const removed = await revokePublishingPermission(session.clientId, userId, key);
    return NextResponse.json({ success: true, data: { revoked: removed } });
  } catch (error) {
    console.error('publishing permissions revoke failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to revoke permission' },
      { status: 500 },
    );
  }
}
