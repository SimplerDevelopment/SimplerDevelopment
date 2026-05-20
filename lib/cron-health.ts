// Tiny instrumentation wrapper for Vercel-cron / Next.js cron route handlers.
// Wraps a `(req: Request) => Promise<Response>` so that each invocation
// upserts a row in `cron_health` at start and again at end (success or
// failure). The original handler's response is returned verbatim — health
// tracking never changes behavior.
//
// Design notes:
//   - One row per `name`, upserted via INSERT ... ON CONFLICT.
//   - We never throw out of the wrapper for tracking-only failures; a broken
//     `cron_health` table must not take a cron down.
//   - On HTTP 5xx we treat the run as "failed" even if the handler did not
//     throw — the response code is our ground truth.

import { db } from '@/lib/db';
import { cronHealth } from '@/lib/db/schema/cronHealth';
import { eq, sql } from 'drizzle-orm';

/** Truncate long error messages so a runaway stack trace doesn't blow up
 *  the row. 4 KB is plenty for a dashboard preview. */
const MAX_ERR_LEN = 4000;

function truncate(err: unknown): string {
  const msg = err instanceof Error
    ? (err.stack || err.message)
    : typeof err === 'string'
      ? err
      : (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
  return msg.length > MAX_ERR_LEN ? msg.slice(0, MAX_ERR_LEN) + '…' : msg;
}

async function recordStart(name: string, area: string): Promise<void> {
  try {
    await db
      .insert(cronHealth)
      .values({
        name,
        area,
        lastRunAt: new Date(),
        runCount: 1,
      })
      .onConflictDoUpdate({
        target: cronHealth.name,
        set: {
          lastRunAt: new Date(),
          runCount: sql`${cronHealth.runCount} + 1`,
          updatedAt: new Date(),
        },
      });
  } catch (e) {
    // Tracking is best-effort. Log and move on.
    console.error('[cron-health] recordStart failed', name, e);
  }
}

async function recordSuccess(name: string): Promise<void> {
  try {
    await db
      .update(cronHealth)
      .set({
        lastSuccessAt: new Date(),
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date(),
      })
      .where(eq(cronHealth.name, name));
  } catch (e) {
    console.error('[cron-health] recordSuccess failed', name, e);
  }
}

async function recordFailure(name: string, err: unknown): Promise<void> {
  try {
    await db
      .update(cronHealth)
      .set({
        lastError: truncate(err),
        lastErrorAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cronHealth.name, name));
  } catch (e) {
    console.error('[cron-health] recordFailure failed', name, e);
  }
}

export type CronArea = 'api-cron' | 'routine' | 'brain-12';

/**
 * Wrap a cron route handler with start/end health tracking. The wrapped
 * handler's behavior is unchanged — same args in, same Response out.
 *
 * Usage:
 *
 *   export const GET = withCronHealth(
 *     { name: 'api-cron:process-embeddings', area: 'api-cron' },
 *     async (req) => { ... }
 *   );
 */
export function withCronHealth(
  opts: { name: string; area: CronArea },
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    await recordStart(opts.name, opts.area);
    try {
      const res = await handler(req);
      // Treat 5xx as a failure even when the handler returns rather than
      // throws — many of these routes catch their own errors and respond 500.
      if (res.status >= 500) {
        await recordFailure(opts.name, `HTTP ${res.status}`);
      } else {
        await recordSuccess(opts.name);
      }
      return res;
    } catch (err) {
      await recordFailure(opts.name, err);
      throw err;
    }
  };
}
