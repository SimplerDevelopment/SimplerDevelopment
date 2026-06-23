/**
 * Contract signature-reminder cron. For each contract still awaiting signature
 * (esign_status in 'sent'/'viewed') whose last nudge (or the original send) is
 * older than REMINDER_INTERVAL_DAYS, re-send the DropboxSign reminder and record
 * it (esign_last_reminder_at + esign_reminder_count). Terminal contracts
 * (signed/declined/canceled) are never touched.
 *
 * The provider call is best-effort — a failure is logged but the reminder is
 * still recorded so we don't hammer the same contract every tick.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { crmContracts } from '@/lib/db/schema';
import { and, inArray, isNotNull, eq, sql } from 'drizzle-orm';
import { remindSignatureRequest } from '@/lib/esign/dropbox-sign';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REMINDER_INTERVAL_DAYS = 3;
const MAX_PER_TICK = 100;

async function _GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const due = await db
    .select({
      id: crmContracts.id,
      requestId: crmContracts.esignProviderRequestId,
      signerEmail: crmContracts.esignSignerEmail,
    })
    .from(crmContracts)
    .where(
      and(
        inArray(crmContracts.esignStatus, ['sent', 'viewed']),
        isNotNull(crmContracts.esignProviderRequestId),
        // (last reminder, or original send) + interval has elapsed.
        sql`COALESCE(${crmContracts.esignLastReminderAt}, ${crmContracts.esignSentAt}) + (${REMINDER_INTERVAL_DAYS} * interval '1 day') <= now()`,
      ),
    )
    .limit(MAX_PER_TICK);

  let reminded = 0;
  let errors = 0;
  for (const c of due) {
    try {
      await remindSignatureRequest(c.requestId ?? '', c.signerEmail ?? '');
    } catch (err) {
      errors++;
      console.error(`[contract-reminders] provider remind failed for contract ${c.id}`, err);
    }
    await db
      .update(crmContracts)
      .set({
        esignLastReminderAt: now,
        esignReminderCount: sql`${crmContracts.esignReminderCount} + 1`,
        updatedAt: now,
      })
      .where(eq(crmContracts.id, c.id));
    reminded++;
  }

  return NextResponse.json({ success: true, data: { reminded, errors } });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-contract-signature-reminders', area: 'api-cron' },
  _GET,
);
