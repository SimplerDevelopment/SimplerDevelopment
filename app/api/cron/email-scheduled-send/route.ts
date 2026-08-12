/**
 * Cron: fire scheduled email campaigns whose scheduledAt <= now().
 *
 * Queries email_campaigns WHERE status = 'scheduled' AND scheduled_at <= NOW().
 * For a tenant-owned campaign (clientId set), this just enqueues the durable
 * send onto internal_jobs (see lib/email/campaign-send-job.ts, PUX-046) — the
 * 1-minute internal_jobs drain cron picks it up, retries with backoff, and
 * dead-letters (flipping the campaign to 'cancelled') only after
 * MAX_ATTEMPTS. Global/agency campaigns (clientId null) can't ride that queue
 * — internal_jobs.client_id is NOT NULL — so those still send inline here,
 * same as before.
 *
 * A per-campaign error is caught and recorded without aborting the batch —
 * one bad campaign must not block the rest.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: every minute — granularity matches scheduledAt
 * precision.
 */

import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns } from '@/lib/db/schema';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import { enqueueCampaignSend } from '@/lib/email/campaign-send-job';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  const due = await db
    .select()
    .from(emailCampaigns)
    .where(
      and(
        eq(emailCampaigns.status, 'scheduled'),
        lte(emailCampaigns.scheduledAt, new Date()),
      ),
    );

  const results: Array<{
    campaignId: number;
    status: 'sent' | 'queued' | 'failed';
    sent?: number;
    failed?: number;
    error?: string;
  }> = [];

  for (const campaign of due) {
    if (campaign.clientId != null) {
      try {
        await enqueueCampaignSend(campaign.id, campaign.clientId);
        results.push({ campaignId: campaign.id, status: 'queued' });
      } catch (err) {
        // Do NOT touch campaign status here — it stays 'scheduled' and
        // this cron re-selects (and re-attempts the enqueue) next tick.
        // enqueueCampaignSend's dedupe key (email.campaign_send:<id>)
        // collapses any duplicate enqueues that land once a retry does
        // succeed, so leaving it 'scheduled' to retry is safe and simpler
        // than trying to distinguish a transient DB blip from a real
        // failure here.
        results.push({
          campaignId: campaign.id,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // Global/agency campaigns (clientId null) can't ride internal_jobs —
    // its client_id column is NOT NULL — so they keep the old inline
    // send + cancel-on-first-error path.
    try {
      const result = await executeCampaignSend(campaign.id, campaign);
      results.push({ campaignId: campaign.id, status: 'sent', sent: result.sent, failed: result.failed });
    } catch (err) {
      // Mark the campaign as cancelled so it does not re-fire on the next
      // tick while the issue is investigated — safer than leaving it in
      // 'scheduled' where it would loop indefinitely.
      try {
        await db
          .update(emailCampaigns)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(emailCampaigns.id, campaign.id));
      } catch {
        // best-effort; do not obscure the original error
      }
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
      processed: due.length,
      durationMs: Date.now() - t0,
      results,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:email-scheduled-send', area: 'api-cron' },
  _GET,
);
