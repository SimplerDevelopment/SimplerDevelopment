import { describe, it, expect } from 'vitest';
import {
  computeBurndown,
  computeSprintTotals,
  computeVelocityAverages,
  type SprintEvent,
} from '@/lib/portal/sprint-charts';

const D = (s: string) => new Date(`${s}T12:00:00Z`);

describe('computeBurndown', () => {
  it('returns empty when sprint hasn\'t started yet', () => {
    const series = computeBurndown([], '2026-06-01', '2026-06-10', D('2026-05-30'));
    expect(series).toEqual([]);
  });

  it('produces one point per day from start through asOf, capped at endDate', () => {
    const events: SprintEvent[] = [
      { action: 'sprint_started', points: null, occurredAt: D('2026-06-01') },
      { action: 'added', points: 8, occurredAt: D('2026-06-01') },
      { action: 'added', points: 5, occurredAt: D('2026-06-01') },
    ];
    const series = computeBurndown(events, '2026-06-01', '2026-06-10', D('2026-06-05'));
    expect(series).toHaveLength(5); // 06-01..06-05 inclusive
    expect(series[0].date).toBe('2026-06-01');
    expect(series[4].date).toBe('2026-06-05');
    // No completions yet → scope stays at 13 every day
    expect(series.map(p => p.remaining)).toEqual([13, 13, 13, 13, 13]);
  });

  it('drops remaining as completions accrue', () => {
    const events: SprintEvent[] = [
      { action: 'added', points: 10, occurredAt: D('2026-06-01') },
      { action: 'completed', points: 3, occurredAt: D('2026-06-02') },
      { action: 'completed', points: 5, occurredAt: D('2026-06-04') },
    ];
    const series = computeBurndown(events, '2026-06-01', '2026-06-10', D('2026-06-05'));
    // Day-by-day: 01=10, 02=10-3=7, 03=7, 04=7-5=2, 05=2
    expect(series.map(p => p.remaining)).toEqual([10, 7, 7, 2, 2]);
  });

  it('reopen reverses a completion', () => {
    const events: SprintEvent[] = [
      { action: 'added', points: 5, occurredAt: D('2026-06-01') },
      { action: 'completed', points: 5, occurredAt: D('2026-06-02') },
      { action: 'reopened', points: 5, occurredAt: D('2026-06-03') },
    ];
    const series = computeBurndown(events, '2026-06-01', '2026-06-05', D('2026-06-04'));
    expect(series.map(p => p.remaining)).toEqual([5, 0, 5, 5]);
  });

  it('ideal line starts at scope and reaches zero by sprint end', () => {
    const events: SprintEvent[] = [
      { action: 'added', points: 10, occurredAt: D('2026-06-01') },
    ];
    const series = computeBurndown(events, '2026-06-01', '2026-06-06', D('2026-06-06'));
    expect(series[0].ideal).toBe(10);
    expect(series[series.length - 1].ideal).toBeLessThanOrEqual(0.01);
  });

  it('handles mid-sprint scope creep without making the ideal line negative', () => {
    const events: SprintEvent[] = [
      { action: 'added', points: 10, occurredAt: D('2026-06-01') },
      { action: 'added', points: 5, occurredAt: D('2026-06-03') },
    ];
    const series = computeBurndown(events, '2026-06-01', '2026-06-06', D('2026-06-04'));
    expect(series.every(p => p.ideal >= 0)).toBe(true);
    // Day 4 scope is 15 (creep), remaining = 15 (no completions)
    expect(series[3].scope).toBe(15);
    expect(series[3].remaining).toBe(15);
  });
});

describe('computeSprintTotals', () => {
  it('returns zero for empty events', () => {
    expect(computeSprintTotals([])).toEqual({ committed: 0, completed: 0 });
  });

  it('sums added (committed) and completed independently', () => {
    const events: SprintEvent[] = [
      { action: 'added', points: 5, occurredAt: D('2026-06-01') },
      { action: 'added', points: 8, occurredAt: D('2026-06-01') },
      { action: 'removed', points: 3, occurredAt: D('2026-06-02') },
      { action: 'completed', points: 5, occurredAt: D('2026-06-03') },
    ];
    expect(computeSprintTotals(events)).toEqual({ committed: 10, completed: 5 });
  });

  it('reopen reverses completion', () => {
    const events: SprintEvent[] = [
      { action: 'added', points: 8, occurredAt: D('2026-06-01') },
      { action: 'completed', points: 8, occurredAt: D('2026-06-02') },
      { action: 'reopened', points: 8, occurredAt: D('2026-06-03') },
    ];
    expect(computeSprintTotals(events)).toEqual({ committed: 8, completed: 0 });
  });

  it('clamps committed/completed to 0 — accounting glitches do not produce negatives', () => {
    const events: SprintEvent[] = [
      { action: 'removed', points: 5, occurredAt: D('2026-06-01') }, // shouldn't happen but
      { action: 'reopened', points: 5, occurredAt: D('2026-06-02') },
    ];
    expect(computeSprintTotals(events)).toEqual({ committed: 0, completed: 0 });
  });
});

describe('computeVelocityAverages', () => {
  it('returns zeros for empty rows', () => {
    expect(computeVelocityAverages([])).toEqual({ averageCompleted: 0, averageCommitted: 0 });
  });

  it('rounds to one decimal place', () => {
    const result = computeVelocityAverages([
      { sprintId: 1, sprintName: 'S1', endDate: null, committed: 10, completed: 8 },
      { sprintId: 2, sprintName: 'S2', endDate: null, committed: 14, completed: 12 },
      { sprintId: 3, sprintName: 'S3', endDate: null, committed: 9, completed: 6 },
    ]);
    expect(result.averageCompleted).toBeCloseTo(8.7, 1);
    expect(result.averageCommitted).toBeCloseTo(11, 1);
  });
});
