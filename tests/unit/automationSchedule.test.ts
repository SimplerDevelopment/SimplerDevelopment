// Unit tests for the per-tenant scheduled-trigger helpers in
// lib/automation/schedule.ts. Pure functions over fixed Dates — no fake
// timers needed.

import { describe, it, expect } from 'vitest';
import {
  computeNextRunAt,
  validateSchedule,
  describeSchedule,
} from '@/lib/automation/schedule';
import type { AutomationSchedule } from '@/lib/db/schema';

function utc(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m, d, h, min, 0, 0));
}

describe('validateSchedule', () => {
  it('rejects non-objects', () => {
    expect(validateSchedule(null).ok).toBe(false);
    expect(validateSchedule('cron').ok).toBe(false);
    expect(validateSchedule(42).ok).toBe(false);
  });

  it('rejects bad cadence values', () => {
    const r = validateSchedule({ cadence: 'hourly', time: '09:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cadence/);
  });

  it('daily requires HH:mm time', () => {
    expect(validateSchedule({ cadence: 'daily' }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'daily', time: '9:00' }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'daily', time: '25:00' }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'daily', time: '09:60' }).ok).toBe(false);
    const ok = validateSchedule({ cadence: 'daily', time: '09:30' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.schedule).toEqual({ cadence: 'daily', time: '09:30' });
  });

  it('weekly requires dayOfWeek in range', () => {
    expect(validateSchedule({ cadence: 'weekly', time: '09:00' }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'weekly', time: '09:00', dayOfWeek: -1 }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'weekly', time: '09:00', dayOfWeek: 7 }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'weekly', time: '09:00', dayOfWeek: 1.5 }).ok).toBe(false);
    const ok = validateSchedule({ cadence: 'weekly', time: '09:00', dayOfWeek: 1 });
    expect(ok.ok).toBe(true);
  });

  it('monthly requires dayOfMonth 1-31', () => {
    expect(validateSchedule({ cadence: 'monthly', time: '09:00' }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'monthly', time: '09:00', dayOfMonth: 0 }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'monthly', time: '09:00', dayOfMonth: 32 }).ok).toBe(false);
    const ok = validateSchedule({ cadence: 'monthly', time: '09:00', dayOfMonth: 15 });
    expect(ok.ok).toBe(true);
  });

  it('cron requires cronExpression', () => {
    expect(validateSchedule({ cadence: 'cron' }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'cron', cronExpression: '' }).ok).toBe(false);
    expect(validateSchedule({ cadence: 'cron', cronExpression: 'totally not cron' }).ok).toBe(false);
    const ok = validateSchedule({ cadence: 'cron', cronExpression: '*/15 * * * *' });
    expect(ok.ok).toBe(true);
  });
});

describe('computeNextRunAt — daily', () => {
  const schedule: AutomationSchedule = { cadence: 'daily', time: '09:30' };

  it('08:00 same day → today at 09:30', () => {
    const next = computeNextRunAt(schedule, utc(2026, 4, 12, 8, 0));
    expect(next).toEqual(utc(2026, 4, 12, 9, 30));
  });

  it('10:00 same day → next day at 09:30', () => {
    const next = computeNextRunAt(schedule, utc(2026, 4, 12, 10, 0));
    expect(next).toEqual(utc(2026, 4, 13, 9, 30));
  });

  it('exactly 09:30 → next day (strictly after)', () => {
    const next = computeNextRunAt(schedule, utc(2026, 4, 12, 9, 30));
    expect(next).toEqual(utc(2026, 4, 13, 9, 30));
  });
});

describe('computeNextRunAt — weekly', () => {
  // dayOfWeek=1 → Monday. 2026-05-11 is a Monday.
  const schedule: AutomationSchedule = { cadence: 'weekly', time: '09:30', dayOfWeek: 1 };

  it('Tuesday 10:00 → next Monday 09:30', () => {
    const tue = utc(2026, 4, 12, 10, 0); // Tue May 12
    const next = computeNextRunAt(schedule, tue);
    expect(next).toEqual(utc(2026, 4, 18, 9, 30)); // Mon May 18
  });

  it('Monday 09:00 → today 09:30', () => {
    const mon = utc(2026, 4, 11, 9, 0); // Mon May 11
    const next = computeNextRunAt(schedule, mon);
    expect(next).toEqual(utc(2026, 4, 11, 9, 30));
  });

  it('Monday 10:00 → next Monday 09:30', () => {
    const mon = utc(2026, 4, 11, 10, 0); // Mon May 11
    const next = computeNextRunAt(schedule, mon);
    expect(next).toEqual(utc(2026, 4, 18, 9, 30)); // Mon May 18
  });
});

describe('computeNextRunAt — monthly', () => {
  it('mid-month (May 5, dayOfMonth=15) → May 15 09:30', () => {
    const s: AutomationSchedule = { cadence: 'monthly', time: '09:30', dayOfMonth: 15 };
    const next = computeNextRunAt(s, utc(2026, 4, 5, 0, 0));
    expect(next).toEqual(utc(2026, 4, 15, 9, 30));
  });

  it('end-of-month (May 20, dayOfMonth=15) → June 15 09:30', () => {
    const s: AutomationSchedule = { cadence: 'monthly', time: '09:30', dayOfMonth: 15 };
    const next = computeNextRunAt(s, utc(2026, 4, 20, 0, 0));
    expect(next).toEqual(utc(2026, 5, 15, 9, 30));
  });

  it('clamps dayOfMonth=31 in Feb non-leap → Feb 28', () => {
    const s: AutomationSchedule = { cadence: 'monthly', time: '09:30', dayOfMonth: 31 };
    // From Feb 1, 2026 (2026 is NOT a leap year)
    const next = computeNextRunAt(s, utc(2026, 1, 1, 0, 0));
    expect(next).toEqual(utc(2026, 1, 28, 9, 30));
  });

  it('clamps dayOfMonth=31 in Feb leap → Feb 29', () => {
    const s: AutomationSchedule = { cadence: 'monthly', time: '09:30', dayOfMonth: 31 };
    // 2024 was a leap year
    const next = computeNextRunAt(s, utc(2024, 1, 1, 0, 0));
    expect(next).toEqual(utc(2024, 1, 29, 9, 30));
  });
});

describe('computeNextRunAt — cron', () => {
  it('*/15 * * * * advances to next quarter-hour', () => {
    const s: AutomationSchedule = { cadence: 'cron', cronExpression: '*/15 * * * *' };
    // At 10:07, the next quarter-hour boundary is 10:15.
    const next = computeNextRunAt(s, utc(2026, 4, 12, 10, 7));
    expect(next).toEqual(utc(2026, 4, 12, 10, 15));
  });

  it('strictly after — at exactly 10:15, returns 10:30', () => {
    const s: AutomationSchedule = { cadence: 'cron', cronExpression: '*/15 * * * *' };
    const next = computeNextRunAt(s, utc(2026, 4, 12, 10, 15));
    expect(next).toEqual(utc(2026, 4, 12, 10, 30));
  });
});

describe('describeSchedule', () => {
  it('daily', () => {
    expect(describeSchedule({ cadence: 'daily', time: '09:30' })).toBe('Daily at 09:30 UTC');
  });
  it('weekly', () => {
    expect(describeSchedule({ cadence: 'weekly', time: '09:30', dayOfWeek: 1 })).toBe('Mondays at 09:30 UTC');
  });
  it('monthly', () => {
    expect(describeSchedule({ cadence: 'monthly', time: '09:30', dayOfMonth: 1 })).toBe('1st of each month at 09:30 UTC');
    expect(describeSchedule({ cadence: 'monthly', time: '09:30', dayOfMonth: 2 })).toBe('2nd of each month at 09:30 UTC');
    expect(describeSchedule({ cadence: 'monthly', time: '09:30', dayOfMonth: 3 })).toBe('3rd of each month at 09:30 UTC');
    expect(describeSchedule({ cadence: 'monthly', time: '09:30', dayOfMonth: 11 })).toBe('11th of each month at 09:30 UTC');
    expect(describeSchedule({ cadence: 'monthly', time: '09:30', dayOfMonth: 21 })).toBe('21st of each month at 09:30 UTC');
  });
  it('cron', () => {
    expect(describeSchedule({ cadence: 'cron', cronExpression: '*/15 * * * *' })).toBe('Custom: */15 * * * *');
  });
});
