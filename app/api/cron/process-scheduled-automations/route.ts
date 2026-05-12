import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automationRules } from '@/lib/db/schema';
import { and, eq, isNotNull, lte, asc } from 'drizzle-orm';
import { computeNextRunAt } from '@/lib/automation/schedule';
import { runRule } from '@/lib/automation/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: fire all scheduled automation rules whose next_run_at is now or
 * past. Runs every minute. Each due rule is CAS-claimed by stamping a new
 * next_run_at — if another worker beat us to it, the UPDATE returns no row
 * and we skip without firing.
 *
 * Idempotent under concurrent runs (the CAS guards double-firing) and per
 * rule (errors are caught individually so one bad rule doesn't break the
 * whole tick).
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
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

  const now = new Date();

  // Find due rules. The partial index automation_rules_next_run_at_idx
  // (enabled, next_run_at) WHERE schedule IS NOT NULL covers this scan.
  const due = await db.select()
    .from(automationRules)
    .where(and(
      eq(automationRules.enabled, true),
      isNotNull(automationRules.schedule),
      isNotNull(automationRules.nextRunAt),
      lte(automationRules.nextRunAt, now),
    ))
    .orderBy(asc(automationRules.nextRunAt))
    .limit(100);

  let scanned = 0;
  let fired = 0;
  let skipped = 0;
  const errors: { ruleId: number; message: string }[] = [];

  for (const rule of due) {
    scanned += 1;
    if (!rule.schedule || !rule.nextRunAt) {
      skipped += 1;
      continue;
    }

    // Recompute the next-next fire time so the CAS update can advance the
    // rule. If the schedule fails to compute (shouldn't happen — validated
    // at save time), null it out so the rule won't keep ticking.
    const nextNext = computeNextRunAt(rule.schedule, now);
    const claimNext = nextNext ?? null;
    const currentNextRunAt = rule.nextRunAt;

    // Atomic claim: only one worker should fire this rule. Setting
    // next_run_at to `claimNext` here means a parallel scheduler tick won't
    // see the same row as due. updatedAt is bumped so the row's revision
    // moves on every successful claim.
    const claimed = await db.update(automationRules)
      .set({ nextRunAt: claimNext, updatedAt: new Date() })
      .where(and(
        eq(automationRules.id, rule.id),
        eq(automationRules.nextRunAt, currentNextRunAt),
      ))
      .returning({ id: automationRules.id });

    if (claimed.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      await runRule(
        rule,
        { ruleId: rule.id, firedAt: now.toISOString() },
        'automation.scheduled',
      );
      fired += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ ruleId: rule.id, message });
    }
  }

  return NextResponse.json({
    success: true,
    scanned,
    fired,
    skipped,
    errors,
  });
}
