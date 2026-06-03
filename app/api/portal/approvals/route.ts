import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mcpPendingChanges, portalApiKeys, users } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';

// Per-client cached count for the layout-shell approvals bell. 30s TTL
// absorbs the per-nav fan-out; the approve / reject / bulk-* routes call
// `revalidateTag('approvals:'+clientId)` to refresh immediately so a user
// who just approved an item doesn't keep seeing the old badge count.
function getApprovalCountCached(clientId: number, status: string) {
  return unstable_cache(
    async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(mcpPendingChanges)
        .where(and(
          eq(mcpPendingChanges.clientId, clientId),
          eq(mcpPendingChanges.status, status),
        ));
      return row?.count ?? 0;
    },
    ['portal-approvals-count', String(clientId), status],
    { revalidate: 30, tags: ['approvals', `approvals:${clientId}`] },
  )();
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const entityType = url.searchParams.get('entityType') ?? undefined;
  const countOnly = url.searchParams.get('count') === 'true';

  if (countOnly) {
    const count = await getApprovalCountCached(client.id, status ?? 'pending');
    return NextResponse.json({ success: true, data: { count } });
  }

  // The full list endpoint is NOT cached — it accepts arbitrary entityType
  // filters and the approvals dashboard expects live data.

  const conds = [eq(mcpPendingChanges.clientId, client.id)];
  if (status) conds.push(eq(mcpPendingChanges.status, status));
  if (entityType) conds.push(eq(mcpPendingChanges.entityType, entityType));

  const rows = await db
    .select({
      id: mcpPendingChanges.id,
      entityType: mcpPendingChanges.entityType,
      entityId: mcpPendingChanges.entityId,
      operation: mcpPendingChanges.operation,
      summary: mcpPendingChanges.summary,
      status: mcpPendingChanges.status,
      keyId: mcpPendingChanges.keyId,
      keyName: portalApiKeys.name,
      submitterName: users.name,
      reviewerId: mcpPendingChanges.reviewerId,
      reviewedAt: mcpPendingChanges.reviewedAt,
      reviewNote: mcpPendingChanges.reviewNote,
      appliedAt: mcpPendingChanges.appliedAt,
      errorMessage: mcpPendingChanges.errorMessage,
      createdAt: mcpPendingChanges.createdAt,
    })
    .from(mcpPendingChanges)
    .leftJoin(portalApiKeys, eq(portalApiKeys.id, mcpPendingChanges.keyId))
    .leftJoin(users, eq(users.id, mcpPendingChanges.userId))
    .where(and(...conds))
    .orderBy(desc(mcpPendingChanges.createdAt))
    .limit(100);

  const role = await getPortalRole(userId, client.id);
  const canManage = role === 'owner' || role === 'admin';

  return NextResponse.json({ success: true, data: rows, meta: { role, canManage } });
}
