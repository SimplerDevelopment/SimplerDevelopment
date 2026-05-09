import { NextResponse } from 'next/server';
import { processRecurrences } from '@/lib/portal/recurrence-processor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: materialize cards from due card_recurrences. Suggested schedule:
 * every 5 minutes (`*\/5 * * * *`) so a recurrence configured for 09:00 UTC
 * fires within minutes of the hour. Vercel cron header is honored;
 * otherwise expects `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
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
