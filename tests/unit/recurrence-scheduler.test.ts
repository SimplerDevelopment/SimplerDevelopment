import { describe, it, expect } from 'vitest';
import { computeNextFireAt, renderRecurrenceTitle } from '@/lib/portal/recurrence-scheduler';

const D = (s: string) => new Date(`${s}Z`);

describe('computeNextFireAt — daily', () => {
  it('advances to tomorrow at hourUtc when from is past today\'s fire time', () => {
    const next = computeNextFireAt(D('2026-06-10T10:00:00.000'), { cadence: 'daily', hourUtc: 9 });
    expect(next.toISOString()).toBe('2026-06-11T09:00:00.000Z');
  });

  it('keeps today when from is before today\'s fire time', () => {
    const next = computeNextFireAt(D('2026-06-10T08:00:00.000'), { cadence: 'daily', hourUtc: 9 });
    expect(next.toISOString()).toBe('2026-06-10T09:00:00.000Z');
  });
});

describe('computeNextFireAt — weekly', () => {
  it('advances to the next configured weekday', () => {
    // 2026-06-10 is a Wednesday (3). Target Friday (5) at 14:00 UTC.
    const next = computeNextFireAt(D('2026-06-10T08:00:00.000'), { cadence: 'weekly', dayOfWeek: 5, hourUtc: 14 });
    expect(next.toISOString()).toBe('2026-06-12T14:00:00.000Z');
  });

  it('rolls to next week when target day already passed this week', () => {
    // Wed → target Tue (2) → next Tue is +6 days
    const next = computeNextFireAt(D('2026-06-10T08:00:00.000'), { cadence: 'weekly', dayOfWeek: 2, hourUtc: 9 });
    expect(next.toISOString()).toBe('2026-06-16T09:00:00.000Z');
  });

  it('rolls to next week if same weekday but past hour', () => {
    // Wed at 10:00 → target Wed at 09:00 → next week
    const next = computeNextFireAt(D('2026-06-10T10:00:00.000'), { cadence: 'weekly', dayOfWeek: 3, hourUtc: 9 });
    expect(next.toISOString()).toBe('2026-06-17T09:00:00.000Z');
  });
});

describe('computeNextFireAt — monthly', () => {
  it('uses the configured dayOfMonth', () => {
    const next = computeNextFireAt(D('2026-06-10T08:00:00.000'), { cadence: 'monthly', dayOfMonth: 15, hourUtc: 9 });
    expect(next.toISOString()).toBe('2026-06-15T09:00:00.000Z');
  });

  it('rolls to next month when this month\'s dayOfMonth already passed', () => {
    const next = computeNextFireAt(D('2026-06-20T08:00:00.000'), { cadence: 'monthly', dayOfMonth: 5, hourUtc: 9 });
    expect(next.toISOString()).toBe('2026-07-05T09:00:00.000Z');
  });

  it('clamps dayOfMonth to 28 to avoid Feb edge cases', () => {
    const next = computeNextFireAt(D('2026-06-01T08:00:00.000'), { cadence: 'monthly', dayOfMonth: 31, hourUtc: 9 });
    expect(next.toISOString()).toBe('2026-06-28T09:00:00.000Z');
  });
});

describe('renderRecurrenceTitle', () => {
  it('replaces {{date}} with the YYYY-MM-DD of the fire date', () => {
    expect(renderRecurrenceTitle('Standup {{date}}', D('2026-06-10T09:00:00.000')))
      .toBe('Standup 2026-06-10');
  });

  it('handles whitespace in the token', () => {
    expect(renderRecurrenceTitle('Status — {{ date }}', D('2026-06-10T09:00:00.000')))
      .toBe('Status — 2026-06-10');
  });

  it('leaves patterns without the token unchanged', () => {
    expect(renderRecurrenceTitle('Weekly review', D('2026-06-10T09:00:00.000')))
      .toBe('Weekly review');
  });
});
