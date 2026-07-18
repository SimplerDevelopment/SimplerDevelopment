import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { agentActionCaptures } from '@/lib/db/schema';
import { lt, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RETENTION_DAYS = 90;

/**
 * Cron endpoint: hard-purge `agent_action_captures` ciphertext older than the
 * 90-day retention window (AAF-001; see the internal ADR log, not part of
 * this public release). The hash log
 * (`agent_action_log`) and redacted summary log (`agent_action_logs`) are
 * untouched — only the encrypted reconstructable capture is time-boxed.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` or Vercel's standard
 * cron header. Anyone else gets 401.
 *
 * Suggested schedule: daily at 04:23 UTC via vercel.json.
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  // Use the DB clock for the cutoff to avoid app<->DB clock skew. Mirrors the
  // parameterized-interval pattern in lib/mcp/expire-pending.ts (never
  // interpolate raw SQL for this).
  const cutoff = sql<Date>`NOW() - (${RETENTION_DAYS}::int || ' days')::interval`;

  const deleted = await db
    .delete(agentActionCaptures)
    .where(lt(agentActionCaptures.createdAt, cutoff))
    .returning({ id: agentActionCaptures.id });

  return NextResponse.json({ success: true, purged: deleted.length });
}

export const GET = withCronHealth(
  { name: 'api-cron:purge-agent-captures', area: 'api-cron' },
  _GET,
);

// Also accept POST for manual triggers from scripts
export const POST = GET;
