import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { isBrainEntitled } from '@/lib/brain/entitlement';
import { runBrainWorkflowOnService, agentsServiceConfigured } from '@/lib/ai/agents-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Per-tenant scheduled Company Brain run.
 *
 * For every brain-entitled tenant, runs `brainWorkflow` on the agents
 * sub-service (`lib/ai/agents-client.ts`) as that tenant's OWNER user. Each call
 * mints a short-lived, single-tenant token, so the agent reaches the portal MCP
 * scoped to exactly that `clientId` — the agents service holds no per-tenant
 * secret. Per-tenant failures are isolated (logged, counted) so one bad tenant
 * never aborts the sweep; the next scheduled run is the retry.
 *
 * Read-only scope: an unattended job has no human to approve writes, so we mint
 * `brain:read` only (least privilege). Widen via `scopes` if a future job needs
 * to mutate through the approval flow.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or Vercel's `x-vercel-cron`).
 * Scheduling: declared in `vercel.json` for Vercel deploys. On a RAILWAY deploy
 * vercel.json crons do NOT fire — an external scheduler (Railway cron service,
 * GitHub Actions, cron-as-a-service) must GET this route with the bearer secret.
 */

const DIGEST_QUERY =
  'Summarise the most important Company Brain updates, open decisions, and tasks ' +
  'that need attention right now. Ground every point in the brain_* tools; be concise.';

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (!agentsServiceConfigured()) {
    return NextResponse.json({
      success: true,
      data: { skipped: 'agents service not configured (SD_AGENTS_URL / SD_AGENTS_INTERNAL_SECRET unset)', processed: 0 },
    });
  }

  // clients.userId is the authoritative single owner (NOT NULL, unique FK).
  const allClients = await db.select({ id: clients.id, userId: clients.userId }).from(clients);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ clientId: number; error: string }> = [];

  // ponytail: sequential — fine for a modest tenant count; move to bounded
  // concurrency or a per-tenant job queue if the sweep gets slow at scale.
  for (const c of allClients) {
    if (!(await isBrainEntitled(c.id))) {
      skipped++;
      continue;
    }
    try {
      await runBrainWorkflowOnService({
        clientId: c.id,
        userId: c.userId,
        query: DIGEST_QUERY,
        scopes: ['brain:read'],
      });
      succeeded++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ clientId: c.id, error: message });
      console.error(`[brain-agent-per-tenant] client ${c.id} failed:`, message);
    }
  }

  return NextResponse.json({
    success: true,
    data: { processed: allClients.length, succeeded, failed, skipped, errors },
  });
}

export const GET = withCronHealth({ name: 'api-cron:brain-agent-per-tenant', area: 'api-cron' }, _GET);
export const POST = GET;
