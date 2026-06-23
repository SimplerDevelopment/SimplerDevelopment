// @vitest-environment node
/**
 * Unit tests for `lib/plugins/handlers/content-tools/schedule.ts`:
 *
 *   - assertExactlyOneMode / detectMode: which of {weekly, cron} the input
 *     describes, and rejection of ambiguous / under-specified shapes.
 *   - computeNextRun in weekly mode: roll-forward semantics (matches the
 *     original v1 `computeNextWeeklyRun` behaviour).
 *   - computeNextRun in cron mode: delegates to cron-parser, returns the
 *     next slot strictly after `now`.
 *   - validateCronExpr: rejects garbage with a useful message.
 *
 * Pure module — no DB, no network, no env reads.
 */
import { describe, it, expect } from 'vitest';

import {
  assertExactlyOneMode,
  computeNextRun,
  detectMode,
  validateCronExpr,
} from '@/lib/plugins/handlers/content-tools/schedule';

// ─── detectMode / assertExactlyOneMode ──────────────────────────────────────

describe('detectMode', () => {
  it('returns "weekly" when dayOfWeek + timeUtc are both set', () => {
    expect(detectMode({ dayOfWeek: 1, timeUtc: '09:00' })).toBe('weekly');
  });

  it('returns "cron" when cronExpr is set and weekly fields are unset', () => {
    expect(detectMode({ cronExpr: '0 9 * * 1' })).toBe('cron');
  });

  it('returns null when both modes are set', () => {
    expect(
      detectMode({ dayOfWeek: 1, timeUtc: '09:00', cronExpr: '0 9 * * 1' }),
    ).toBeNull();
  });

  it('returns null when no mode is set', () => {
    expect(detectMode({})).toBeNull();
  });
});

describe('assertExactlyOneMode', () => {
  it('returns the detected mode when valid', () => {
    expect(assertExactlyOneMode({ dayOfWeek: 2, timeUtc: '14:30' })).toBe('weekly');
    expect(assertExactlyOneMode({ cronExpr: '*/15 * * * *' })).toBe('cron');
  });

  it('rejects both modes set simultaneously', () => {
    expect(() =>
      assertExactlyOneMode({ dayOfWeek: 1, timeUtc: '09:00', cronExpr: '0 9 * * 1' }),
    ).toThrow(/mutually exclusive/);
  });

  it('rejects dayOfWeek without timeUtc', () => {
    expect(() => assertExactlyOneMode({ dayOfWeek: 1 })).toThrow(/timeUtc/);
  });

  it('rejects timeUtc without dayOfWeek', () => {
    expect(() => assertExactlyOneMode({ timeUtc: '09:00' })).toThrow(/dayOfWeek/);
  });

  it('rejects an empty schedule', () => {
    expect(() => assertExactlyOneMode({})).toThrow(/either/);
  });

  it('treats empty-string cronExpr as not set', () => {
    expect(() => assertExactlyOneMode({ cronExpr: '' })).toThrow();
  });
});

// ─── computeNextRun — weekly mode ──────────────────────────────────────────
// Same semantics as the original v1 `computeNextWeeklyRun`: today's slot in
// the past rolls to next week; today's slot in the future stays today.

describe('computeNextRun (weekly mode)', () => {
  it('picks the next occurrence later this week', () => {
    // Monday 2026-05-18 12:00 UTC — next Tuesday 09:00 is in ~21h.
    const from = new Date('2026-05-18T12:00:00Z');
    const next = computeNextRun({ dayOfWeek: 2, timeUtc: '09:00' }, from);
    expect(next.toISOString()).toBe('2026-05-19T09:00:00.000Z');
  });

  it('rolls to next week when the slot already passed today', () => {
    // Tuesday 2026-05-19 12:00 UTC, slot is Tue 09:00 — already gone.
    const from = new Date('2026-05-19T12:00:00Z');
    const next = computeNextRun({ dayOfWeek: 2, timeUtc: '09:00' }, from);
    expect(next.toISOString()).toBe('2026-05-26T09:00:00.000Z');
  });

  it('stays today when the slot is still in the future today', () => {
    // Tuesday 2026-05-19 08:00 UTC, slot Tue 09:00 — still ahead today.
    const from = new Date('2026-05-19T08:00:00Z');
    const next = computeNextRun({ dayOfWeek: 2, timeUtc: '09:00' }, from);
    expect(next.toISOString()).toBe('2026-05-19T09:00:00.000Z');
  });

  it('handles dayOfWeek=0 (Sunday)', () => {
    const from = new Date('2026-05-18T00:00:00Z'); // Monday
    const next = computeNextRun({ dayOfWeek: 0, timeUtc: '14:30' }, from);
    expect(next.toISOString()).toBe('2026-05-24T14:30:00.000Z'); // following Sunday
  });

  it('throws on invalid dayOfWeek', () => {
    expect(() => computeNextRun({ dayOfWeek: -1, timeUtc: '09:00' })).toThrow();
    expect(() => computeNextRun({ dayOfWeek: 7, timeUtc: '09:00' })).toThrow();
  });

  it('throws on invalid timeUtc', () => {
    expect(() => computeNextRun({ dayOfWeek: 1, timeUtc: '25:00' })).toThrow();
    expect(() => computeNextRun({ dayOfWeek: 1, timeUtc: '9:00' })).toThrow();
    expect(() => computeNextRun({ dayOfWeek: 1, timeUtc: 'bad' })).toThrow();
  });
});

// ─── computeNextRun — cron mode ────────────────────────────────────────────

describe('computeNextRun (cron mode)', () => {
  it('returns the next slot for "0 9 * * 1" (Mondays 09:00 UTC)', () => {
    const from = new Date('2026-05-18T12:00:00Z'); // Monday after 09:00
    const next = computeNextRun({ cronExpr: '0 9 * * 1' }, from);
    expect(next.toISOString()).toBe('2026-05-25T09:00:00.000Z');
  });

  it('supports sub-weekly cadence — "0 9 * * *" (every day 09:00 UTC)', () => {
    const from = new Date('2026-05-18T12:00:00Z');
    const next = computeNextRun({ cronExpr: '0 9 * * *' }, from);
    expect(next.toISOString()).toBe('2026-05-19T09:00:00.000Z');
  });

  it('supports step expressions — "*/15 * * * *"', () => {
    const from = new Date('2026-05-18T12:07:30Z');
    const next = computeNextRun({ cronExpr: '*/15 * * * *' }, from);
    expect(next.toISOString()).toBe('2026-05-18T12:15:00.000Z');
  });

  it('always returns a moment strictly after `now`', () => {
    const from = new Date('2026-05-18T09:00:00Z');
    const next = computeNextRun({ cronExpr: '0 9 * * *' }, from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it('throws on malformed cron expressions', () => {
    expect(() => computeNextRun({ cronExpr: 'not a cron' })).toThrow();
    // cron-parser tolerates several edge cases (e.g. 4-field forms), so the
    // contract here is "obvious garbage throws," not "every shape that
    // wouldn't fit a 5-field schema throws."
  });
});

// ─── validateCronExpr ──────────────────────────────────────────────────────

describe('validateCronExpr', () => {
  it('accepts standard 5-field expressions', () => {
    expect(validateCronExpr('0 9 * * 1')).toEqual({ ok: true });
    expect(validateCronExpr('*/5 * * * *')).toEqual({ ok: true });
    expect(validateCronExpr('0 0 1 * *')).toEqual({ ok: true });
  });

  it('rejects garbage with a useful error', () => {
    const bad = validateCronExpr('hello world');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toMatch(/Invalid cron expression/);
    }
  });

  it('rejects empty string', () => {
    const bad = validateCronExpr('');
    expect(bad.ok).toBe(false);
  });
});
