import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { automationRules } from '@/lib/db/schema';
import { and, eq, isNotNull, asc, lte } from 'drizzle-orm';
import { computeNextRunAt } from '@/lib/automation/schedule';
import { runRule } from '@/lib/automation/engine';
import { isAuthorizedCron } from '@/lib/cron-auth';

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
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Find due rules. The partial index automation_rules_next_run_at_idx
  // (enabled, next_run_at) WHERE schedule IS NOT NULL covers this scan.
  // next_run_at is timestamptz, so this comparison is TZ-correct.
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

    // CAS claim, still-due predicate. Exact `nextRunAt = <observed>` can't be
    // used: timestamptz has microsecond precision but postgres-js reads it back
    // as a millisecond JS Date, so equality never matches. Re-assert
    // `nextRunAt <= now` instead — the winner advances nextRunAt to a future
    // slot (or null), so a racing tick's predicate is false and it claims 0 rows.
    const claimed = await db.update(automationRules)
      .set({ nextRunAt: claimNext, updatedAt: new Date() })
      .where(and(
        eq(automationRules.id, rule.id),
        lte(automationRules.nextRunAt, now),
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

export const GET = withCronHealth(
  { name: 'api-cron:process-scheduled-automations', area: 'api-cron' },
  _GET,
);
