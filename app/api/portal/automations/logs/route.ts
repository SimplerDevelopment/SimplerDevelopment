import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { automationLogs } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, desc } from 'drizzle-orm';

// GET /api/portal/automations/logs?ruleId=<id>
// Returns logs scoped to the caller's client. The ruleId param never bypasses
// the client filter — a cross-tenant ruleId simply returns an empty list.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const url = new URL(req.url);
  const ruleIdParam = url.searchParams.get('ruleId');
  const ruleId = ruleIdParam ? parseInt(ruleIdParam, 10) : null;

  const conditions = ruleId
    ? and(eq(automationLogs.clientId, client.id), eq(automationLogs.ruleId, ruleId))
    : eq(automationLogs.clientId, client.id);

  const logs = await db
    .select()
    .from(automationLogs)
    .where(conditions)
    .orderBy(desc(automationLogs.createdAt));

  return NextResponse.json({ success: true, logs });
}
