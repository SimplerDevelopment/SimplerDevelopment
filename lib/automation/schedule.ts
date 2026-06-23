/**
 * Automation schedule helpers — compute, validate, and describe time-based
 * triggers (daily / weekly / monthly / cron). All math is in UTC; v1 does
 * not expose a timezone field.
 *
 * Used by:
 *   - app/api/portal/automations[/[id]]/route.ts — validate user input and
 *     pre-compute next_run_at on insert/update.
 *   - app/api/cron/process-scheduled-automations/route.ts — recompute next
 *     fire time after claiming a rule and firing it.
 *   - app/portal/brain/automations/page.tsx — live preview ("Next runs at …")
 *     and the human-readable schedule badge on rule cards.
 */

import { CronExpressionParser } from 'cron-parser';
import type { AutomationSchedule } from '@/lib/db/schema';

// ─── TIME PARSING ──────────────────────────────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseHHmm(time: string): { hour: number; minute: number } | null {
  const m = HHMM_RE.exec(time);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * Last day of the given UTC month (handles leap years for Feb).
 */
function lastDayOfMonth(year: number, monthZeroIndexed: number): number {
  // Day 0 of the *next* month is the last day of `monthZeroIndexed`.
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}

// ─── computeNextRunAt ──────────────────────────────────────────────────────

/**
 * Returns the next firing time strictly AFTER `fromTime` for the given
 * schedule. Strictly-after semantics mean a rule firing exactly on the minute
 * doesn't double-trigger when the scheduler runs at the same minute.
 *
 * Returns `null` if the schedule is malformed beyond what validateSchedule
 * caught (defensive — callers should validate first).
 */
export function computeNextRunAt(
  schedule: AutomationSchedule,
  fromTime: Date,
): Date | null {
  switch (schedule.cadence) {
    case 'daily':
      return computeNextDaily(schedule, fromTime);
    case 'weekly':
      return computeNextWeekly(schedule, fromTime);
    case 'monthly':
      return computeNextMonthly(schedule, fromTime);
    case 'cron':
      return computeNextCron(schedule, fromTime);
    default:
      return null;
  }
}

function computeNextDaily(schedule: AutomationSchedule, fromTime: Date): Date | null {
  if (!schedule.time) return null;
  const t = parseHHmm(schedule.time);
  if (!t) return null;

  const candidate = new Date(Date.UTC(
    fromTime.getUTCFullYear(),
    fromTime.getUTCMonth(),
    fromTime.getUTCDate(),
    t.hour,
    t.minute,
    0,
    0,
  ));
  if (candidate.getTime() > fromTime.getTime()) return candidate;
  // Otherwise next day.
  candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

function computeNextWeekly(schedule: AutomationSchedule, fromTime: Date): Date | null {
  if (!schedule.time) return null;
  if (schedule.dayOfWeek == null || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) return null;
  const t = parseHHmm(schedule.time);
  if (!t) return null;

  // Start from today at HH:mm UTC and walk forward until the day matches and
  // the timestamp is strictly after fromTime.
  let candidate = new Date(Date.UTC(
    fromTime.getUTCFullYear(),
    fromTime.getUTCMonth(),
    fromTime.getUTCDate(),
    t.hour,
    t.minute,
    0,
    0,
  ));
  // Up to 7 day-advancements to find the matching weekday after `fromTime`.
  for (let i = 0; i < 8; i++) {
    if (candidate.getUTCDay() === schedule.dayOfWeek && candidate.getTime() > fromTime.getTime()) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}

function computeNextMonthly(schedule: AutomationSchedule, fromTime: Date): Date | null {
  if (!schedule.time) return null;
  if (schedule.dayOfMonth == null || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) return null;
  const t = parseHHmm(schedule.time);
  if (!t) return null;

  // Try this month, then next, then the one after — cap at 12 iterations to
  // be paranoid about edge cases (we won't actually need that many).
  let year = fromTime.getUTCFullYear();
  let month = fromTime.getUTCMonth();
  for (let i = 0; i < 13; i++) {
    const lastDay = lastDayOfMonth(year, month);
    const day = Math.min(schedule.dayOfMonth, lastDay);
    const candidate = new Date(Date.UTC(year, month, day, t.hour, t.minute, 0, 0));
    if (candidate.getTime() > fromTime.getTime()) return candidate;
    // Advance one month.
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return null;
}

function computeNextCron(schedule: AutomationSchedule, fromTime: Date): Date | null {
  if (!schedule.cronExpression) return null;
  try {
    const interval = CronExpressionParser.parse(schedule.cronExpression, {
      currentDate: fromTime,
      tz: 'UTC',
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

// ─── validateSchedule ──────────────────────────────────────────────────────

export type ScheduleValidation =
  | { ok: true; schedule: AutomationSchedule }
  | { ok: false; error: string };

/**
 * Coerce + validate user input into an `AutomationSchedule`. Rejects bad
 * shape, time format, dayOfWeek out-of-range, dayOfMonth out-of-range,
 * cron parse failure. Used by POST/PATCH on /api/portal/automations.
 */
export function validateSchedule(input: unknown): ScheduleValidation {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'schedule must be an object' };
  }
  const obj = input as Record<string, unknown>;
  const cadence = obj.cadence;
  if (cadence !== 'daily' && cadence !== 'weekly' && cadence !== 'monthly' && cadence !== 'cron') {
    return { ok: false, error: 'schedule.cadence must be one of daily, weekly, monthly, cron' };
  }

  if (cadence === 'cron') {
    if (typeof obj.cronExpression !== 'string' || obj.cronExpression.trim() === '') {
      return { ok: false, error: 'schedule.cronExpression is required for cadence=cron' };
    }
    try {
      CronExpressionParser.parse(obj.cronExpression, { tz: 'UTC' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Invalid cron expression: ${msg}` };
    }
    return { ok: true, schedule: { cadence, cronExpression: obj.cronExpression } };
  }

  // daily / weekly / monthly all need `time`.
  if (typeof obj.time !== 'string' || !HHMM_RE.test(obj.time)) {
    return { ok: false, error: 'schedule.time must be a 24h HH:mm string (UTC)' };
  }

  if (cadence === 'daily') {
    return { ok: true, schedule: { cadence: 'daily', time: obj.time } };
  }

  if (cadence === 'weekly') {
    if (typeof obj.dayOfWeek !== 'number' || !Number.isInteger(obj.dayOfWeek) || obj.dayOfWeek < 0 || obj.dayOfWeek > 6) {
      return { ok: false, error: 'schedule.dayOfWeek must be an integer 0–6 (Sun–Sat)' };
    }
    return { ok: true, schedule: { cadence: 'weekly', time: obj.time, dayOfWeek: obj.dayOfWeek } };
  }

  // monthly
  if (typeof obj.dayOfMonth !== 'number' || !Number.isInteger(obj.dayOfMonth) || obj.dayOfMonth < 1 || obj.dayOfMonth > 31) {
    return { ok: false, error: 'schedule.dayOfMonth must be an integer 1–31' };
  }
  return { ok: true, schedule: { cadence: 'monthly', time: obj.time, dayOfMonth: obj.dayOfMonth } };
}

// ─── describeSchedule ──────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Human-readable schedule summary for UI badges and previews.
//   "Daily at 09:30 UTC"
//   "Mondays at 09:30 UTC"
//   "1st of each month at 09:30 UTC"
//   "Custom: */15 * * * *"
export function describeSchedule(schedule: AutomationSchedule): string {
  switch (schedule.cadence) {
    case 'daily':
      return `Daily at ${schedule.time ?? '??:??'} UTC`;
    case 'weekly': {
      const day = schedule.dayOfWeek != null ? DAYS_OF_WEEK[schedule.dayOfWeek] : 'Unknown day';
      return `${day} at ${schedule.time ?? '??:??'} UTC`;
    }
    case 'monthly': {
      const day = schedule.dayOfMonth != null ? ordinal(schedule.dayOfMonth) : '?';
      return `${day} of each month at ${schedule.time ?? '??:??'} UTC`;
    }
    case 'cron':
      return `Custom: ${schedule.cronExpression ?? '?'}`;
    default:
      return 'Unknown schedule';
  }
}
