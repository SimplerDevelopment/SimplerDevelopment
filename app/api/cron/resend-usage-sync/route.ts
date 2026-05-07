import { NextResponse } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns, emailCampaignSends, usageMeterEvents } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: roll up the current period's email-send count per client into
 * `usage_meter_events`.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 * Mirrors the pattern in app/api/cron/stuck-booking-holds/route.ts.
 *
 * STUB: this counts rows in `email_campaign_sends` (joined to campaigns to
 * resolve clientId) for the current YYYY-MM, then upserts a single
 * `(clientId, period, resource='email_send', source='resend')` row per
 * client. Idempotent — re-running on the same period does NOT double-count
 * because the upsert key is (clientId, period, resource, source) and we
 * write the absolute count, not a delta.
 *
 * TODO(byok-foundation): replace the local row count with a fetch from
 * Resend's billing/usage API once that integration is wired. Local
 * `email_campaign_sends` rows are produced by our own send pipeline and so
 * underestimate any direct Resend traffic. Tracking issue:
 * pricing-byok-foundation -> "wire real Resend usage". For now the count is
 * close enough to drive the admin tier picker / overage UI.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const t0 = Date.now();
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // Lower bound for the current period — first day of the month at 00:00 UTC.
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Count sends per client for the current period. Filter on sentAt to count
  // *actual* deliveries this period, not just rows that existed.
  const rows = await db
    .select({
      clientId: emailCampaigns.clientId,
      sendCount: sql<number>`count(${emailCampaignSends.id})::int`,
    })
    .from(emailCampaignSends)
    .innerJoin(emailCampaigns, eq(emailCampaigns.id, emailCampaignSends.campaignId))
    .where(and(
      gte(emailCampaignSends.sentAt, periodStart),
      sql`${emailCampaigns.clientId} is not null`,
    ))
    .groupBy(emailCampaigns.clientId);

  let upserted = 0;
  for (const row of rows) {
    if (row.clientId == null) continue;
    // Upsert: write the absolute count for this period. Schema doesn't have
    // a composite unique index (events are append-only by design), so we do
    // the find-or-update in two steps. This keeps the upsert idempotent on
    // re-runs.
    const [existing] = await db
      .select({ id: usageMeterEvents.id })
      .from(usageMeterEvents)
      .where(and(
        eq(usageMeterEvents.clientId, row.clientId),
        eq(usageMeterEvents.period, period),
        eq(usageMeterEvents.resource, 'email_send'),
        eq(usageMeterEvents.source, 'resend'),
      ))
      .limit(1);

    if (existing) {
      await db.update(usageMeterEvents)
        .set({ amount: row.sendCount.toString(), recordedAt: new Date() })
        .where(eq(usageMeterEvents.id, existing.id));
    } else {
      await db.insert(usageMeterEvents).values({
        clientId: row.clientId,
        resource: 'email_send',
        period,
        amount: row.sendCount.toString(),
        source: 'resend',
      });
    }
    upserted += 1;
  }

  return NextResponse.json({
    success: true,
    data: {
      period,
      clientsSynced: rows.length,
      upserted,
      durationMs: Date.now() - t0,
      mode: 'stub-local-count',
    },
  });
}
