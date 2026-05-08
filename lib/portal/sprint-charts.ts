// Pure functions that turn sprint_scope_history events into chart-ready series.
// Kept DB-free so the unit tests can run without DATABASE_URL.

export type SprintEventAction = 'sprint_started' | 'added' | 'removed' | 'completed' | 'reopened';

export interface SprintEvent {
  action: SprintEventAction;
  points: number | null;
  occurredAt: Date | string;
}

export interface BurndownPoint {
  date: string; // ISO yyyy-mm-dd
  remaining: number;
  completed: number;
  scope: number; // committed scope at that point — sum of added - removed
  ideal: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(input: Date | string): Date {
  const d = typeof input === 'string' ? new Date(input) : new Date(input.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Replays scope-history events into a daily burndown series. The chart's
 * "remaining" line uses end-of-day snapshots; the "ideal" line is linear from
 * committed-at-start to zero across the sprint window.
 *
 * Idempotent assumptions:
 * - `events` may contain at most one `sprint_started` row.
 * - `added` / `completed` / `reopened` events for the same card may occur
 *   multiple times; the caller (recordCardColumnMove) is responsible for not
 *   emitting redundant events.
 */
export function computeBurndown(
  events: SprintEvent[],
  startDate: Date | string,
  endDate: Date | string,
  asOf: Date = new Date(),
): BurndownPoint[] {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const today = startOfDay(asOf);
  const lastDay = today.getTime() < end.getTime() ? today : end;

  if (lastDay.getTime() < start.getTime()) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  // Walk the events, computing running totals of scope (added - removed) and
  // completed (completed - reopened). Bucket each event into its UTC day.
  type Daily = { scopeDelta: number; completedDelta: number };
  const daily = new Map<string, Daily>();

  for (const ev of sorted) {
    const day = isoDay(startOfDay(ev.occurredAt));
    if (!daily.has(day)) daily.set(day, { scopeDelta: 0, completedDelta: 0 });
    const bucket = daily.get(day)!;
    const pts = ev.points ?? 0;
    if (ev.action === 'added') bucket.scopeDelta += pts;
    else if (ev.action === 'removed') bucket.scopeDelta -= pts;
    else if (ev.action === 'completed') bucket.completedDelta += pts;
    else if (ev.action === 'reopened') bucket.completedDelta -= pts;
    // sprint_started is metadata; the day-zero baseline is the sum of `added`
    // events recorded by recordSprintStarted alongside it, so no delta here.
  }

  // Iterate calendar days from start to lastDay, accumulating running totals.
  const result: BurndownPoint[] = [];
  let scope = 0;
  let completed = 0;

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  let dayIndex = 0;

  for (let t = start.getTime(); t <= lastDay.getTime(); t += DAY_MS) {
    const day = isoDay(new Date(t));
    const bucket = daily.get(day);
    if (bucket) {
      scope += bucket.scopeDelta;
      completed += bucket.completedDelta;
    }
    const remaining = Math.max(0, scope - completed);
    // Ideal: at day 0, remaining = scope; at totalDays, remaining = 0. Linear.
    // We re-anchor against the *current* scope so a re-baseline mid-sprint
    // (scope creep) doesn't make the ideal line look impossibly low.
    const ideal = Math.max(0, scope * (1 - dayIndex / totalDays));
    result.push({ date: day, remaining, completed, scope, ideal });
    dayIndex += 1;
  }

  return result;
}

export interface VelocityRow {
  sprintId: number;
  sprintName: string;
  endDate: string | null;
  committed: number;
  completed: number;
}

export interface VelocityRollup {
  rows: VelocityRow[];
  averageCompleted: number;
  averageCommitted: number;
}

/**
 * Aggregates committed (sum of `added` events) and completed (sum of
 * `completed` minus `reopened`) for one sprint. Caller passes the sprint's
 * events; this function is pure.
 */
export function computeSprintTotals(events: SprintEvent[]): { committed: number; completed: number } {
  let committed = 0;
  let completed = 0;
  for (const ev of events) {
    const pts = ev.points ?? 0;
    if (ev.action === 'added') committed += pts;
    else if (ev.action === 'removed') committed -= pts;
    else if (ev.action === 'completed') completed += pts;
    else if (ev.action === 'reopened') completed -= pts;
  }
  return { committed: Math.max(0, committed), completed: Math.max(0, completed) };
}

export function computeVelocityAverages(rows: VelocityRow[]): { averageCompleted: number; averageCommitted: number } {
  if (rows.length === 0) return { averageCompleted: 0, averageCommitted: 0 };
  const totalCompleted = rows.reduce((s, r) => s + r.completed, 0);
  const totalCommitted = rows.reduce((s, r) => s + r.committed, 0);
  return {
    averageCompleted: Math.round((totalCompleted / rows.length) * 10) / 10,
    averageCommitted: Math.round((totalCommitted / rows.length) * 10) / 10,
  };
}
