/**
 * Cron: auto-promote A/B test winners after the 4-hour decision window.
 *
 * Queries email_campaigns WHERE status = 'ab_testing' AND ab_decided_at IS NULL
 * AND sent_at <= NOW() - INTERVAL '4 hours'.
 *
 * For each qualifying campaign, delegates to executeAbPromotion() — the same
 * logic the manual promote-winner route uses. A per-campaign failure is
 * recorded and logged without aborting the batch.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: every 30 minutes — window is 4h, so 30min polling is fine.
 */

import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns } from '@/lib/db/schema';
import { executeAbPromotion } from '@/lib/email/ab-promotion';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  // Campaigns that are in the A/B testing phase and whose 4-hour window has
  // elapsed. We use a raw SQL interval expression to avoid pulling a Date
  // constant through ORM escaping.
  const ready = await db
    .select()
    .from(emailCampaigns)
    .where(
      and(
        eq(emailCampaigns.status, 'ab_testing'),
        isNull(emailCampaigns.abDecidedAt),
        lte(emailCampaigns.sentAt, sql`NOW() - INTERVAL '4 hours'`),
      ),
    );

  type ResultEntry = {
    campaignId: number;
    status: 'promoted' | 'failed';
    winner?: string;
    sent?: number;
    failed?: number;
    error?: string;
  };

  const results: ResultEntry[] = [];

  for (const campaign of ready) {
    // Guard: abSubjectB must be set — if not, skip without crashing the batch.
    if (!campaign.abSubjectB?.trim()) {
      results.push({
        campaignId: campaign.id,
        status: 'failed',
        error: 'abSubjectB is empty — cannot determine winner',
      });
      continue;
    }

    try {
      const r = await executeAbPromotion(campaign.id, campaign);
      results.push({
        campaignId: campaign.id,
        status: 'promoted',
        winner: r.winner,
        sent: r.sent,
        failed: r.failed,
      });
    } catch (err) {
      results.push({
        campaignId: campaign.id,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      processed: ready.length,
      durationMs: Date.now() - t0,
      results,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:email-ab-promote', area: 'api-cron' },
  _GET,
);
