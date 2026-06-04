import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { automationLogs } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, desc } from 'drizzle-orm';

// GET /api/portal/automations/logs?ruleId=<id>&limit=<n>&detail=true
// Returns logs scoped to the caller's client. The ruleId param never bypasses
// the client filter — a cross-tenant ruleId simply returns an empty list.
//
// Projection modes:
//   default        — slim shape (no triggerPayload / actionsExecuted JSON
//                    blobs). Target <1 KB/row. Used by the layout shell bell
//                    that just wants the most-recent log timestamps + status.
//   ?detail=true   — full row including triggerPayload + actionsExecuted.
//                    Used by the dedicated automations log viewer.
//
// `limit` defaults to 100 (was unbounded before). Capped at 500 to keep
// response sizes predictable.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const url = new URL(req.url);
  const ruleIdParam = url.searchParams.get('ruleId');
  const ruleId = ruleIdParam ? parseInt(ruleIdParam, 10) : null;
  const detail = url.searchParams.get('detail') === 'true';

  const limitParam = url.searchParams.get('limit');
  let limit = 100;
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) limit = Math.min(parsed, 500);
  }

  const conditions = ruleId
    ? and(eq(automationLogs.clientId, client.id), eq(automationLogs.ruleId, ruleId))
    : eq(automationLogs.clientId, client.id);

  if (detail) {
    // Full payload — used by the dedicated log viewer page.
    const logs = await db
      .select()
      .from(automationLogs)
      .where(conditions)
      .orderBy(desc(automationLogs.createdAt))
      .limit(limit);
    return NextResponse.json({ success: true, logs });
  }

  // Slim default projection — omits the two JSON blob columns
  // (triggerPayload, actionsExecuted) which dominate row size in practice.
  // Target ~150-300 bytes/row vs ~5 KB/row for the full shape.
  const logs = await db
    .select({
      id: automationLogs.id,
      clientId: automationLogs.clientId,
      ruleId: automationLogs.ruleId,
      triggerEvent: automationLogs.triggerEvent,
      status: automationLogs.status,
      duration: automationLogs.duration,
      errorMessage: automationLogs.errorMessage,
      createdAt: automationLogs.createdAt,
    })
    .from(automationLogs)
    .where(conditions)
    .orderBy(desc(automationLogs.createdAt))
    .limit(limit);

  return NextResponse.json({ success: true, logs });
}
