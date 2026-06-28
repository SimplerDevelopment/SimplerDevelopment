import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { mcpPendingChanges, portalApiKeys, users } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

// Per-client cached count for the layout-shell approvals bell. 30s TTL
// absorbs the per-nav fan-out; the approve / reject / bulk-* routes call
// `revalidateTag('approvals:'+clientId)` to refresh immediately so a user
// who just approved an item doesn't keep seeing the old badge count.
async function getApprovalCount(clientId: number, status: string): Promise<number> {
  const inner = async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mcpPendingChanges)
      .where(and(
        eq(mcpPendingChanges.clientId, clientId),
        eq(mcpPendingChanges.status, status),
      ));
    return row?.count ?? 0;
  };
  try {
    return await unstable_cache(inner, ['portal-approvals-count', String(clientId), status], {
      revalidate: 30,
      tags: ['approvals', `approvals:${clientId}`],
    })();
  } catch {
    // Outside a request context (tests/cron) — incrementalCache unavailable.
    return inner();
  }
}

export async function GET(req: Request) {
  // Bearer-aware (mobile) + NextAuth (web). Read access = any member.
  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;
  const { client, role } = authResult;

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const entityType = url.searchParams.get('entityType') ?? undefined;
  const countOnly = url.searchParams.get('count') === 'true';

  if (countOnly) {
    const count = await getApprovalCount(client.id, status ?? 'pending');
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

  const canManage = role === 'owner' || role === 'admin';

  return NextResponse.json({ success: true, data: rows, meta: { role, canManage } });
}
