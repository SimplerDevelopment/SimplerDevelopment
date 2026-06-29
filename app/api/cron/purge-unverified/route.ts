import { NextResponse } from 'next/server';
import { purgeUnverifiedAccounts, UNVERIFIED_PURGE_DAYS } from '@/lib/signup/service';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: delete self-serve signups that never verified their email
 * within UNVERIFIED_PURGE_DAYS. Scoped to role='client' rows that still carry
 * a pending verification token — invited/legacy users are untouchable.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` or Vercel cron header.
 * Schedule: 05:30 UTC daily.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const purged = await purgeUnverifiedAccounts();
  return NextResponse.json({ success: true, purged, windowDays: UNVERIFIED_PURGE_DAYS });
}

export const POST = GET;
