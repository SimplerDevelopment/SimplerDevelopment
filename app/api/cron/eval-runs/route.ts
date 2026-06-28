import { NextResponse } from 'next/server';
import { drainQueue } from '@/lib/ai/evals/worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: drain the eval-run queue.
 *
 * Reaps stale 'running' runs (crashed workers), then claims + executes up to
 * `max` queued `eval_runs` via the worker. Runs use the platform Anthropic key
 * (ANTHROPIC_API_KEY); a run whose suite needs a key fails cleanly if it's unset.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` or the Vercel cron header.
 * Suggested schedule: every few minutes (the queue is usually empty).
 *
 * Optional query params (manual runs only):
 *   ?max=20        — cap runs executed this pass (default 10)
 *   ?staleMins=30  — reap runs stuck in 'running' longer than this
 *   ?mock=1        — score against case mockOutputs (no model calls); for smoke tests
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const bearerOk = cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isVercelCron && !bearerOk) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const maxRaw = url.searchParams.get('max');
  const staleRaw = url.searchParams.get('staleMins');
  const mock = url.searchParams.get('mock') === '1';

  const max = maxRaw !== null ? parseInt(maxRaw, 10) : 10;
  if (Number.isNaN(max) || max < 1 || max > 100) {
    return NextResponse.json({ success: false, message: 'max must be between 1 and 100' }, { status: 400 });
  }
  const staleMins = staleRaw !== null ? parseInt(staleRaw, 10) : 30;
  if (Number.isNaN(staleMins) || staleMins < 1 || staleMins > 1440) {
    return NextResponse.json({ success: false, message: 'staleMins must be between 1 and 1440' }, { status: 400 });
  }

  try {
    const { reaped, ran } = await drainQueue({
      max,
      reapTimeoutMs: staleMins * 60 * 1000,
      mock,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
    return NextResponse.json({ success: true, reaped, ran: ran.length, runIds: ran });
  } catch (err) {
    console.error('[cron/eval-runs]', err);
    return NextResponse.json({ success: false, message: 'drain failed' }, { status: 500 });
  }
}

export const POST = GET;
