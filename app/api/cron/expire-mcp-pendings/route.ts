import { NextResponse } from 'next/server';
import { expireStalePendings } from '@/lib/mcp/expire-pending';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: expire stale MCP pending changes.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` or Vercel's standard
 * cron header. Anyone else gets 401.
 *
 * Suggested schedule: daily at 03:17 UTC via vercel.json.
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

  // Optional query params for test/manual-run scoping. Production cron passes none.
  const url = new URL(req.url);
  const ttlSecondsRaw = url.searchParams.get('ttlSeconds');
  const idsRaw = url.searchParams.get('ids');
  const ttlSeconds = ttlSecondsRaw !== null ? parseInt(ttlSecondsRaw, 10) : undefined;
  const ids = idsRaw
    ? idsRaw.split(',').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n))
    : undefined;

  const result = await expireStalePendings({
    ttlSeconds: ttlSeconds !== undefined && !Number.isNaN(ttlSeconds) ? ttlSeconds : undefined,
    ids,
  });
  return NextResponse.json({ success: true, ...result });
}

// Also accept POST for manual triggers from scripts
export const POST = GET;
