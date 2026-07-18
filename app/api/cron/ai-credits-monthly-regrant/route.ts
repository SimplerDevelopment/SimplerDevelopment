/**
 * Cron: monthly AI-credit re-grant for all active subscriptions.
 *
 * Context: `grantMonthlyCredits` is normally triggered by Stripe
 * subscription-activation / renewal webhooks. Long-running subscriptions that
 * don't generate a renewal event in a given calendar month would never receive
 * their included AI credits. This cron fills that gap by re-granting on the
 * 2nd of each month (after billing cycles have had a day to settle).
 *
 * Idempotency: before calling `grantMonthlyCredits(clientId)` the handler
 * checks the `ai_credit_ledger` table for an existing `type='grant'` row for
 * that client in the current calendar month (YYYY-MM) whose service_category
 * is NOT 'signup' (signup grants are one-time and unrelated to billing cycles).
 * If such a row exists we skip that client — the grant already happened (either
 * from a webhook or from a prior cron invocation this month). This means
 * running the cron twice in one month is safe.
 *
 * Scope: every `client_services` row with status='active' that belongs to a
 * service with `included_ai_credits > 0`. Clients with no such subscriptions
 * are naturally skipped by `grantMonthlyCredits` itself (it returns
 * `{ granted: 0 }` early).
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: 0 6 2 * * — 06:00 UTC on the 2nd of every month.
 */

import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { aiCreditLedger, clientServices, services } from '@/lib/db/schema';
import { grantMonthlyCredits } from '@/lib/ai-credits';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';

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

  // ── 1. Find every clientId with at least one active service that has AI credits ──
  const eligibleRows = await db
    .selectDistinct({ clientId: clientServices.clientId })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(
      eq(clientServices.status, 'active'),
      gt(services.includedAiCredits, 0),
    ));

  const eligibleClientIds = eligibleRows.map((r) => r.clientId);

  if (eligibleClientIds.length === 0) {
    return NextResponse.json({
      success: true,
      data: { checked: 0, granted: 0, skipped: 0, totalTokens: 0, durationMs: Date.now() - t0 },
    });
  }

  // ── 2. Find clients that already received a monthly grant this calendar month ──
  // We look for any ledger row where:
  //   type = 'grant'  AND  service_category != 'signup'  (excludes one-time signup grants)
  //   AND created_at >= start of current month (UTC)
  // These clients are skipped — grant already applied (webhook or prior cron run).
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const alreadyGrantedRows = eligibleClientIds.length > 0
    ? await db
        .selectDistinct({ clientId: aiCreditLedger.clientId })
        .from(aiCreditLedger)
        .where(and(
          inArray(aiCreditLedger.clientId, eligibleClientIds),
          eq(aiCreditLedger.type, 'grant'),
          sql`${aiCreditLedger.serviceCategory} != 'signup'`,
          sql`${aiCreditLedger.createdAt} >= ${monthStart.toISOString()}`,
        ))
    : [];

  const alreadyGrantedSet = new Set(alreadyGrantedRows.map((r) => r.clientId));
  const pendingClientIds = eligibleClientIds.filter((id) => !alreadyGrantedSet.has(id));

  // ── 3. Grant credits to each pending client ──
  let totalGranted = 0;
  let totalTokens = 0;

  for (const clientId of pendingClientIds) {
    const result = await grantMonthlyCredits(clientId);
    if (result.granted > 0) {
      totalGranted++;
      totalTokens += result.granted;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      checked: eligibleClientIds.length,
      skipped: alreadyGrantedSet.size,
      granted: totalGranted,
      totalTokens,
      durationMs: Date.now() - t0,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:ai-credits-monthly-regrant', area: 'api-cron' },
  _GET,
);

// Accept POST for manual triggers (matches other crons).
export const POST = GET;
