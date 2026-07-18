// Pure schedule helpers for registered_app_jobs. Two mutually-exclusive
// modes:
//
//   weekly:  dayOfWeek (0..6, Sun=0) + timeUtc ('HH:mm')   — original v1 mode
//   cron:    cronExpr  (5-field cron, UTC)                  — added in v2
//
// `computeNextRun()` dispatches on whichever mode is populated and returns
// the next UTC Date. Validation lives in `assertExactlyOneMode()` — called
// by the jobs handler on create/update — so the runtime helpers don't have
// to revalidate. cron parsing reuses the same `cron-parser` library that
// `lib/automation/schedule.ts` uses, so we stay consistent with the rest of
// the codebase.

import { CronExpressionParser } from 'cron-parser';

export const TIME_UTC_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ScheduleInput = {
  dayOfWeek?: number | null;
  timeUtc?: string | null;
  cronExpr?: string | null;
};

export type ScheduleMode = 'weekly' | 'cron';

export function detectMode(s: ScheduleInput): ScheduleMode | null {
  const hasWeekly = s.dayOfWeek != null && s.timeUtc != null;
  const hasCron = s.cronExpr != null && s.cronExpr !== '';
  if (hasWeekly && hasCron) return null;
  if (hasWeekly) return 'weekly';
  if (hasCron) return 'cron';
  return null;
}

/**
 * Throws if the input has zero or both modes set. Used by jobs.ts on
 * create/update to fail fast before persisting an ambiguous row.
 */
export function assertExactlyOneMode(s: ScheduleInput): ScheduleMode {
  const mode = detectMode(s);
  if (mode !== null) return mode;
  const hasWeekly = s.dayOfWeek != null || s.timeUtc != null;
  const hasCron = s.cronExpr != null && s.cronExpr !== '';
  if (hasWeekly && hasCron) {
    throw new Error('schedule: weekly (dayOfWeek+timeUtc) and cronExpr are mutually exclusive');
  }
  if (s.dayOfWeek != null && s.timeUtc == null) {
    throw new Error('schedule: dayOfWeek requires timeUtc');
  }
  if (s.timeUtc != null && s.dayOfWeek == null) {
    throw new Error('schedule: timeUtc requires dayOfWeek');
  }
  throw new Error('schedule: must provide either (dayOfWeek + timeUtc) or cronExpr');
}

/**
 * Returns the next UTC `Date` the job should fire at, given the schedule and
 * a reference `now`. Throws on malformed inputs — callers are expected to
 * have validated via `assertExactlyOneMode()` first.
 *
 * Weekly mode: if today matches dayOfWeek but the timeUtc slot has already
 * passed today, rolls forward to next week (avoids same-tick duplicate
 * firings when a job is created and immediately ticked).
 *
 * Cron mode: returns `parser.next().toDate()`. cron-parser's `next()` is
 * already strictly-after `currentDate`, so no extra guard is needed.
 */
export function computeNextRun(s: ScheduleInput, now: Date = new Date()): Date {
  const mode = assertExactlyOneMode(s);
  if (mode === 'cron') {
    return computeNextCron(s.cronExpr as string, now);
  }
  return computeNextWeekly(s.dayOfWeek as number, s.timeUtc as string, now);
}

function computeNextCron(cronExpr: string, now: Date): Date {
  const interval = CronExpressionParser.parse(cronExpr, {
    currentDate: now,
    tz: 'UTC',
  });
  return interval.next().toDate();
}

function computeNextWeekly(dayOfWeek: number, timeUtc: string, now: Date): Date {
  const m = timeUtc.match(TIME_UTC_RE);
  if (!m) throw new Error(`schedule: invalid timeUtc='${timeUtc}'`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error(`schedule: invalid dayOfWeek=${dayOfWeek}`);
  }

  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    0,
    0,
  ));
  let daysAhead = (dayOfWeek - candidate.getUTCDay() + 7) % 7;
  if (daysAhead === 0 && candidate.getTime() <= now.getTime()) {
    daysAhead = 7;
  }
  candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
  return candidate;
}

/**
 * Reject a cron expression at write time — same parser the runtime helper
 * uses, so a string that validates here will work at fire time. We also
 * reject empty strings explicitly because cron-parser is more permissive
 * than the column constraint expects.
 */
export function validateCronExpr(cronExpr: string): { ok: true } | { ok: false; error: string } {
  if (typeof cronExpr !== 'string' || cronExpr.trim() === '') {
    return { ok: false, error: 'Invalid cron expression: empty string' };
  }
  try {
    CronExpressionParser.parse(cronExpr, { tz: 'UTC' });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid cron expression: ${msg}` };
  }
}
