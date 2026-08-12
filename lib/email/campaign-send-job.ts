// Durable send path for email campaigns: the enqueue helper + the
// internal_jobs handler (PUX-046).
//
// Why: executeCampaignSend loops every recipient serially through Resend. The
// old callers ran that loop inside a request handler (portal route, MCP call)
// or a cron tick — a large list blocked the caller for minutes, and a platform
// timeout stranded the campaign in status='sending' with nothing retrying it.
// The scheduled-send cron additionally marked a campaign 'cancelled' on the
// FIRST error, so one transient Resend blip killed a scheduled send outright.
//
// Producers call enqueueCampaignSend(); the process-internal-jobs cron drains
// the job within ~60s. executeCampaignSend is resume-safe (skips subscribers
// already in email_campaign_sends), so a retry after a mid-send death — lease
// reclaim included — picks up where it left off instead of double-sending.

import { and, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import { emailCampaigns, internalJobs } from '@/lib/db/schema';
import { enqueueJob, MAX_ATTEMPTS } from '@/lib/jobs';

type Db = typeof defaultDb;

export function campaignSendDedupeKey(campaignId: number): string {
  return `email.campaign_send:${campaignId}`;
}

/**
 * Enqueue a durable send for a campaign. Callers should have already
 * validated auth/tenancy/status — this only guarantees at-least-once dispatch.
 *
 * dedupe_key is unique across the WHOLE internal_jobs table, including
 * completed rows — without the cleanup below a campaign could never be
 * legitimately re-sent (re-scheduled later, or re-triggered after a config
 * fix): the old completed/dead_letter row would swallow the new enqueue via
 * ON CONFLICT DO NOTHING. Deleting only TERMINAL rows keeps the live-dedupe
 * guarantee intact: a pending/running job still collapses concurrent enqueues.
 */
export async function enqueueCampaignSend(
  campaignId: number,
  clientId: number,
  db: Db = defaultDb,
): Promise<void> {
  await db
    .delete(internalJobs)
    .where(
      and(
        eq(internalJobs.dedupeKey, campaignSendDedupeKey(campaignId)),
        inArray(internalJobs.status, ['completed', 'dead_letter']),
      ),
    );
  await enqueueJob(
    {
      clientId,
      type: 'email.campaign_send',
      payload: { campaignId, clientId },
      dedupeKey: campaignSendDedupeKey(campaignId),
    },
    db,
  );
  // "queued" IS "sending" as far as the product is concerned, so the enqueue
  // owns the status flip — every producer (portal route, MCP apply, scheduled
  // cron) gets it without repeating it. Also load-bearing for the cron: a
  // 'scheduled' campaign that stayed 'scheduled' after enqueue would be
  // re-selected every tick. If this flip fails the enqueue already stuck: the
  // next attempt's ON CONFLICT no-ops and the flip retries. executeCampaignSend
  // re-asserts 'sending' (plus totalRecipients) when the job actually runs.
  await db
    .update(emailCampaigns)
    .set({ status: 'sending', updatedAt: new Date() })
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, clientId)));
}

/**
 * internal_jobs handler for 'email.campaign_send'. A throw is the retry
 * signal (backoff, then dead_letter after MAX_ATTEMPTS).
 */
export async function runCampaignSendJob(
  payload: Record<string, unknown>,
  db: Db,
): Promise<void> {
  const campaignId = payload.campaignId;
  if (typeof campaignId !== 'number') {
    throw new Error(`email.campaign_send: payload.campaignId must be a number, got ${typeof campaignId}`);
  }

  const [campaign] = await db
    .select()
    .from(emailCampaigns)
    .where(eq(emailCampaigns.id, campaignId))
    .limit(1);

  // Deleted since enqueue — a retry can't fix that; complete the job quietly.
  if (!campaign) return;
  // Tenancy paranoia: the job row's owner was stamped into the payload at
  // enqueue. A mismatch means the campaign changed hands (or the payload was
  // forged) — either way, don't send.
  if (campaign.clientId != null && campaign.clientId !== payload.clientId) return;
  // Finished by an earlier attempt (e.g. lease reclaimed after the worker died
  // post-completion). Without this guard executeCampaignSend would throw
  // "No active subscribers remaining" and burn retries on a done campaign.
  if (campaign.status === 'sent') return;

  const { executeCampaignSend } = await import('./campaign-send');
  try {
    await executeCampaignSend(campaignId, campaign);
  } catch (err) {
    // On the FINAL attempt, flip the campaign to 'cancelled' so it doesn't
    // strand in 'sending' forever once the job dead-letters. (The old cron did
    // this on the first error; the queue gives it MAX_ATTEMPTS with backoff.)
    // The drain updates attempt_count AFTER the handler returns, so the row's
    // current value is this run's attempt number minus one.
    const [job] = await db
      .select({ attemptCount: internalJobs.attemptCount })
      .from(internalJobs)
      .where(eq(internalJobs.dedupeKey, campaignSendDedupeKey(campaignId)))
      .limit(1);
    if (job && job.attemptCount + 1 >= MAX_ATTEMPTS) {
      await db
        .update(emailCampaigns)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(emailCampaigns.id, campaignId));
    }
    throw err;
  }
}
