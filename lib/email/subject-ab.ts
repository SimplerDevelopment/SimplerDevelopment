/**
 * Email subject A/B test helpers.
 *
 * Independent of lib/ab/* — emails have their own delivery semantics that
 * don't fit the visitor-cookie/render-swap model. This module owns the
 * per-recipient split logic and winner aggregation.
 *
 * Flow:
 *   1. Caller sorts the subscriber list deterministically (by id) so the
 *      same recipients land in A vs. B across re-runs (resume-safe).
 *   2. splitForAbTest() carves out the first abTestSizePct of the list and
 *      assigns half to "a" and half to "b". Remainder is held back.
 *   3. Initial send dispatches A and B with their respective subject lines.
 *   4. After WINNER_DECISION_DELAY_HOURS, an operator (or a future cron)
 *      hits POST /api/portal/email-campaigns/[id]/promote-winner. That
 *      endpoint calls aggregateAbVariantCounts() and pickAbWinner() to
 *      decide, records the winner subject, and dispatches the held-back
 *      remainder with that subject.
 */

import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaignSends, emailCampaigns } from '@/lib/db/schema';

/** How long to wait between initial A/B send and winner promotion. */
export const WINNER_DECISION_DELAY_HOURS = 4;

/** Variant tag stored on email_campaign_sends.ab_variant. */
export type AbVariant = 'a' | 'b' | 'winner';

export interface AbSplit<T extends { id: number }> {
  /** Subscribers assigned to subject A (the existing `subject` column). */
  a: T[];
  /** Subscribers assigned to subject B (the `ab_subject_b` column). */
  b: T[];
  /** Held back for the winner phase. Empty if A/B is disabled. */
  remainder: T[];
}

/**
 * Split a recipient list deterministically into A/B test cohorts plus a
 * remainder. Caller must pass the recipients in stable order — sorting by
 * `id` ascending is the convention.
 *
 * @param testSizePct How much of the list to spend on the test (0-100, the
 *   schema clamps to 5-50 in the UI). Half goes to A, half to B.
 *   Below 2 recipients, the function falls back to "everyone gets A and
 *   nothing held back" — A/B is meaningless on tiny lists.
 */
export function splitForAbTest<T extends { id: number }>(
  recipients: T[],
  testSizePct: number,
): AbSplit<T> {
  if (recipients.length < 2) {
    return { a: recipients, b: [], remainder: [] };
  }
  const pct = Math.max(2, Math.min(100, Math.floor(testSizePct || 10)));
  const testCount = Math.max(2, Math.floor((recipients.length * pct) / 100));
  // Make testCount even so A and B get the same size.
  const testCountEven = testCount - (testCount % 2);
  const testSlice = recipients.slice(0, testCountEven);
  const remainder = recipients.slice(testCountEven);
  const half = testCountEven / 2;
  return {
    a: testSlice.slice(0, half),
    b: testSlice.slice(half),
    remainder,
  };
}

export interface VariantCounts {
  variant: AbVariant;
  sent: number;
  opened: number;
  clicked: number;
}

/**
 * Aggregate open/click counts per variant in ONE query. Used by the
 * winner-promotion endpoint to avoid N+1.
 */
export async function aggregateAbVariantCounts(
  campaignId: number,
): Promise<VariantCounts[]> {
  const rows = await db
    .select({
      variant: emailCampaignSends.abVariant,
      sent: sql<number>`count(*)::int`,
      opened: sql<number>`count(${emailCampaignSends.openedAt})::int`,
      clicked: sql<number>`count(${emailCampaignSends.clickedAt})::int`,
    })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId))
    .groupBy(emailCampaignSends.abVariant);

  return rows
    .filter(r => r.variant === 'a' || r.variant === 'b' || r.variant === 'winner')
    .map(r => ({
      variant: r.variant as AbVariant,
      sent: r.sent,
      opened: r.opened,
      clicked: r.clicked,
    }));
}

/**
 * Decide which variant won. Ties break toward "a" (the existing subject)
 * for stability. If both variants have zero opens/clicks, "a" still wins
 * by convention — operator can always re-run.
 */
export function pickAbWinner(
  counts: VariantCounts[],
  metric: 'open' | 'click',
): { winner: 'a' | 'b'; reason: string } {
  const a = counts.find(c => c.variant === 'a');
  const b = counts.find(c => c.variant === 'b');
  const aValue = a ? (metric === 'open' ? a.opened : a.clicked) : 0;
  const bValue = b ? (metric === 'open' ? b.opened : b.clicked) : 0;
  if (bValue > aValue) {
    return { winner: 'b', reason: `B beat A on ${metric} (${bValue} vs ${aValue})` };
  }
  return { winner: 'a', reason: aValue === bValue
    ? `Tie on ${metric} (${aValue} each) — defaulting to A`
    : `A beat B on ${metric} (${aValue} vs ${bValue})` };
}

/**
 * Returns true if enough time has elapsed since the campaign's initial
 * A/B blast for the winner to be picked. Currently a hard-coded 4h —
 * see WINNER_DECISION_DELAY_HOURS.
 *
 * TODO: schedule via existing cron infra (see app/api/cron/*). For now an
 * operator hits POST /api/portal/email-campaigns/[id]/promote-winner.
 */
export function isAbDecisionWindowReady(
  abInitialSentAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!abInitialSentAt) return false;
  const elapsedMs = now.getTime() - abInitialSentAt.getTime();
  return elapsedMs >= WINNER_DECISION_DELAY_HOURS * 60 * 60 * 1000;
}

/**
 * Read-only snapshot of the A/B state on a campaign. Used by the UI to
 * render "waiting / decided" status.
 */
export async function getAbStatus(campaignId: number): Promise<{
  enabled: boolean;
  decided: boolean;
  decidedAt: Date | null;
  winnerSubject: string | null;
  testSizePct: number;
  metric: 'open' | 'click';
  subjectA: string;
  subjectB: string | null;
  counts: VariantCounts[];
} | null> {
  const [campaign] = await db
    .select({
      abEnabled: emailCampaigns.abEnabled,
      abSubjectB: emailCampaigns.abSubjectB,
      abWinnerMetric: emailCampaigns.abWinnerMetric,
      abTestSizePct: emailCampaigns.abTestSizePct,
      abWinnerSubject: emailCampaigns.abWinnerSubject,
      abDecidedAt: emailCampaigns.abDecidedAt,
      subject: emailCampaigns.subject,
    })
    .from(emailCampaigns)
    .where(eq(emailCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) return null;
  const counts = campaign.abEnabled ? await aggregateAbVariantCounts(campaignId) : [];

  return {
    enabled: campaign.abEnabled,
    decided: !!campaign.abDecidedAt,
    decidedAt: campaign.abDecidedAt,
    winnerSubject: campaign.abWinnerSubject,
    testSizePct: campaign.abTestSizePct ?? 10,
    metric: (campaign.abWinnerMetric === 'click' ? 'click' : 'open'),
    subjectA: campaign.subject,
    subjectB: campaign.abSubjectB,
    counts,
  };
}

