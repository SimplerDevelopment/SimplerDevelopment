import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { processRecurrences } from '@/lib/portal/recurrence-processor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: materialize cards from due card_recurrences. Suggested schedule:
 * every 5 minutes (`*\/5 * * * *`) so a recurrence configured for 09:00 UTC
 * fires within minutes of the hour. Vercel cron header is honored;
 * otherwise expects `Authorization: Bearer ${CRON_SECRET}`.
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await processRecurrences();
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    console.error('[cron/pm-recurrences]', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}

export const GET = withCronHealth(
  { name: 'api-cron:pm-recurrences', area: 'api-cron' },
  _GET,
);
