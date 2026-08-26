import { describe, it, expect, vi } from 'vitest';

// This suite exercises only the pure bucketing/status/milestone helpers —
// no query ever runs. `lib/db/index.ts` throws synchronously at import if
// DATABASE_URL isn't set (a real footgun in an isolated worktree with no
// .env), and dashboard-aggregate.ts imports `db` at module scope for the
// orchestrator in the same file. Stub it so importing the pure exports below
// doesn't require a live DB connection to even exist.
vi.mock('@/lib/db', () => ({ db: {} }));

import {
  isCardDone,
  bucketOverdueAndDueThisWeek,
  computeBlockedMap,
  computeWipBreaches,
  bucketStale,
  isValidatingColumn,
  bucketValidating,
  computeSprintStatus,
  computeProjectHealth,
  buildActivityFeed,
  buildWorkload,
  buildMilestones,
  type CardRow,
  type ColumnRow,
  type ProjectRow,
  type DependencyRow,
  type ActivityRow,
  type AssigneeRow,
  type UserRow,
  type SprintRow,
} from '@/lib/projects/dashboard-aggregate';

const NOW = new Date('2026-08-25T12:00:00.000Z');

const project = (id: number, overrides: Partial<ProjectRow> = {}): ProjectRow => ({
  id,
  name: `Project ${id}`,
  clientId: 1,
  dueDate: null,
  ...overrides,
});

const column = (id: number, projectId: number, overrides: Partial<ColumnRow> = {}): ColumnRow => ({
  id,
  projectId,
  name: 'To Do',
  isDone: false,
  wipLimit: null,
  ...overrides,
});

const card = (id: number, projectId: number, columnId: number, overrides: Partial<CardRow> = {}): CardRow => ({
  id,
  projectId,
  columnId,
  title: `Card ${id}`,
  dueDate: null,
  storyPoints: null,
  sprintId: null,
  workflowState: 'todo',
  updatedAt: NOW,
  ...overrides,
});

function colMap(cols: ColumnRow[]): Map<number, ColumnRow> {
  return new Map(cols.map((c) => [c.id, c]));
}
function cardMap(cards: CardRow[]): Map<number, CardRow> {
  return new Map(cards.map((c) => [c.id, c]));
}
function projMap(projects: ProjectRow[]): Map<number, ProjectRow> {
  return new Map(projects.map((p) => [p.id, p]));
}

// ── isCardDone ──────────────────────────────────────────────────────────

describe('isCardDone', () => {
  it('true only when the card column isDone', () => {
    const cols = colMap([column(1, 1, { isDone: false }), column(2, 1, { isDone: true })]);
    expect(isCardDone(card(1, 1, 1), cols)).toBe(false);
    expect(isCardDone(card(2, 1, 2), cols)).toBe(true);
  });
});

// ── overdue / due-this-week bucketing ──────────────────────────────────

describe('bucketOverdueAndDueThisWeek', () => {
  const cols = colMap([column(1, 1, { isDone: false }), column(2, 1, { isDone: true })]);

  it('routes a past due date to overdue', () => {
    const c = card(1, 1, 1, { dueDate: new Date('2026-08-20T00:00:00.000Z') });
    const { overdue, dueThisWeek } = bucketOverdueAndDueThisWeek([c], cols, NOW);
    expect(overdue.map((x) => x.id)).toEqual([1]);
    expect(dueThisWeek).toEqual([]);
  });

  it('routes a date exactly 7 days out to dueThisWeek (inclusive boundary)', () => {
    const sevenDaysOut = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
    const c = card(1, 1, 1, { dueDate: sevenDaysOut });
    const { overdue, dueThisWeek } = bucketOverdueAndDueThisWeek([c], cols, NOW);
    expect(overdue).toEqual([]);
    expect(dueThisWeek.map((x) => x.id)).toEqual([1]);
  });

  it('excludes a date one millisecond past the 7-day boundary', () => {
    const justOver = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000 + 1);
    const c = card(1, 1, 1, { dueDate: justOver });
    const { overdue, dueThisWeek } = bucketOverdueAndDueThisWeek([c], cols, NOW);
    expect(overdue).toEqual([]);
    expect(dueThisWeek).toEqual([]);
  });

  it('ignores cards with no due date', () => {
    const c = card(1, 1, 1, { dueDate: null });
    const { overdue, dueThisWeek } = bucketOverdueAndDueThisWeek([c], cols, NOW);
    expect(overdue).toEqual([]);
    expect(dueThisWeek).toEqual([]);
  });

  it('excludes done cards even when overdue', () => {
    const c = card(1, 1, 2, { dueDate: new Date('2026-08-20T00:00:00.000Z') }); // column 2 isDone
    const { overdue, dueThisWeek } = bucketOverdueAndDueThisWeek([c], cols, NOW);
    expect(overdue).toEqual([]);
    expect(dueThisWeek).toEqual([]);
  });
});

// ── blocked bucket ──────────────────────────────────────────────────────

describe('computeBlockedMap', () => {
  it('marks a card blocked when its blocker is in a not-done column', () => {
    const cols = colMap([column(1, 1, { isDone: false })]);
    const cards = cardMap([card(1, 1, 1), card(2, 1, 1)]);
    const deps: DependencyRow[] = [{ blockedCardId: 2, blockerCardId: 1 }];
    const map = computeBlockedMap(deps, cards, cols);
    expect(map.get(2)).toEqual([1]);
  });

  it('does not mark a card blocked when its blocker is done', () => {
    const cols = colMap([column(1, 1, { isDone: false }), column(2, 1, { isDone: true })]);
    const cards = cardMap([card(1, 1, 2), card(2, 1, 1)]); // card 1 in done column
    const deps: DependencyRow[] = [{ blockedCardId: 2, blockerCardId: 1 }];
    const map = computeBlockedMap(deps, cards, cols);
    expect(map.has(2)).toBe(false);
  });

  it('fails closed (treats as unresolved) when the blocker card is unknown', () => {
    const cols = colMap([column(1, 1, { isDone: false })]);
    const cards = cardMap([card(2, 1, 1)]); // blocker id 999 not in the map
    const deps: DependencyRow[] = [{ blockedCardId: 2, blockerCardId: 999 }];
    const map = computeBlockedMap(deps, cards, cols);
    expect(map.get(2)).toEqual([999]);
  });
});

// ── WIP breaches ────────────────────────────────────────────────────────

describe('computeWipBreaches', () => {
  it('flags a column whose card count exceeds wipLimit', () => {
    const cols = [column(1, 1, { wipLimit: 2, name: 'Doing' })];
    const cards = [card(1, 1, 1), card(2, 1, 1), card(3, 1, 1)];
    const breaches = computeWipBreaches(cols, cards, projMap([project(1)]));
    expect(breaches).toEqual([{ projectId: 1, projectName: 'Project 1', columnId: 1, columnName: 'Doing', wipLimit: 2, count: 3 }]);
  });

  it('ignores columns without a wipLimit', () => {
    const cols = [column(1, 1, { wipLimit: null })];
    const cards = [card(1, 1, 1), card(2, 1, 1), card(3, 1, 1)];
    expect(computeWipBreaches(cols, cards, projMap([project(1)]))).toEqual([]);
  });

  it('does not flag a column at or under its limit', () => {
    const cols = [column(1, 1, { wipLimit: 3 })];
    const cards = [card(1, 1, 1), card(2, 1, 1), card(3, 1, 1)];
    expect(computeWipBreaches(cols, cards, projMap([project(1)]))).toEqual([]);
  });
});

// ── stale bucket ────────────────────────────────────────────────────────

describe('bucketStale', () => {
  const cols = colMap([column(1, 1, { isDone: false }), column(2, 1, { isDone: true })]);

  it('flags a not-done card with no activity in staleAfterDays, falling back to updatedAt', () => {
    const old = new Date('2026-08-01T00:00:00.000Z'); // 24 days before NOW
    const c = card(1, 1, 1, { updatedAt: old });
    const stale = bucketStale([c], cols, new Map(), NOW, 14);
    expect(stale.map((x) => x.id)).toEqual([1]);
  });

  it('uses the activity map over updatedAt when present', () => {
    const oldUpdated = new Date('2026-08-01T00:00:00.000Z');
    const recentActivity = new Date('2026-08-24T00:00:00.000Z'); // 1 day before NOW
    const c = card(1, 1, 1, { updatedAt: oldUpdated });
    const activityMap = new Map([[1, recentActivity.getTime()]]);
    const stale = bucketStale([c], cols, activityMap, NOW, 14);
    expect(stale).toEqual([]);
  });

  it('does not flag a card active within the window', () => {
    const recent = new Date('2026-08-20T00:00:00.000Z'); // 5 days before NOW
    const c = card(1, 1, 1, { updatedAt: recent });
    expect(bucketStale([c], cols, new Map(), NOW, 14)).toEqual([]);
  });

  it('excludes done cards from staleness', () => {
    const old = new Date('2026-01-01T00:00:00.000Z');
    const c = card(1, 1, 2, { updatedAt: old }); // done column
    expect(bucketStale([c], cols, new Map(), NOW, 14)).toEqual([]);
  });
});

// ── validating bucket ───────────────────────────────────────────────────

describe('isValidatingColumn / bucketValidating', () => {
  it('matches "Validating" case-insensitively when not isDone', () => {
    expect(isValidatingColumn(column(1, 1, { name: 'Validating', isDone: false }))).toBe(true);
    expect(isValidatingColumn(column(2, 1, { name: 'VALIDATING', isDone: false }))).toBe(true);
    expect(isValidatingColumn(column(3, 1, { name: 'validating', isDone: false }))).toBe(true);
  });

  it('does not match a Validating column flagged isDone', () => {
    expect(isValidatingColumn(column(1, 1, { name: 'Validating', isDone: true }))).toBe(false);
  });

  it('does not match a differently-named column', () => {
    expect(isValidatingColumn(column(1, 1, { name: 'In Review', isDone: false }))).toBe(false);
  });

  it('bucketValidating returns cards sitting in a Validating column', () => {
    const cols = [column(1, 1, { name: 'Validating', isDone: false }), column(2, 1, { name: 'Done', isDone: true })];
    const cards = [card(1, 1, 1), card(2, 1, 2)];
    expect(bucketValidating(cards, cols).map((c) => c.id)).toEqual([1]);
  });
});

// ── sprint status ───────────────────────────────────────────────────────

describe('computeSprintStatus', () => {
  const base = {
    startDate: new Date('2026-08-11T00:00:00.000Z'), // 14 days before NOW
    endDate: new Date('2026-08-25T00:00:00.000Z'),   // sprint ends "today" (NOW)
    now: NOW,
  };

  it('on_track when remaining points are at/under the elapsed-time projection', () => {
    // ~14/14 days elapsed -> expected remaining fraction ~0 -> almost any
    // remaining points would normally be at_risk, so pin elapsed to exactly
    // half via a shorter-elapsed fixture instead.
    const status = computeSprintStatus({
      startDate: new Date('2026-08-21T12:00:00.000Z'), // 4 days before NOW
      endDate: new Date('2026-08-29T12:00:00.000Z'),   // 4 days after NOW -> 50% elapsed
      totalPoints: 10,
      remainingPoints: 4, // expected remaining = 10 * 0.5 = 5; 4 <= 5
      totalCards: 0,
      remainingCards: 0,
      now: NOW,
    });
    expect(status).toBe('on_track');
  });

  it('at_risk when remaining points exceed the elapsed-time projection', () => {
    const status = computeSprintStatus({
      startDate: new Date('2026-08-21T12:00:00.000Z'),
      endDate: new Date('2026-08-29T12:00:00.000Z'), // 50% elapsed
      totalPoints: 10,
      remainingPoints: 8, // expected remaining = 5; 8 > 5
      totalCards: 0,
      remainingCards: 0,
      now: NOW,
    });
    expect(status).toBe('at_risk');
  });

  it('falls back to card counts when no story points are tracked', () => {
    const status = computeSprintStatus({
      startDate: new Date('2026-08-21T12:00:00.000Z'),
      endDate: new Date('2026-08-29T12:00:00.000Z'), // 50% elapsed
      totalPoints: 0,
      remainingPoints: 0,
      totalCards: 10,
      remainingCards: 8, // expected remaining = 5; 8 > 5 -> at_risk
      now: NOW,
    });
    expect(status).toBe('at_risk');
  });

  it('on_track when there is nothing to burn', () => {
    const status = computeSprintStatus({ ...base, totalPoints: 0, remainingPoints: 0, totalCards: 0, remainingCards: 0 });
    expect(status).toBe('on_track');
  });

  it('on_track when start/end dates are unusable', () => {
    const status = computeSprintStatus({
      startDate: null,
      endDate: null,
      totalPoints: 10,
      remainingPoints: 10,
      totalCards: 0,
      remainingCards: 0,
      now: NOW,
    });
    expect(status).toBe('on_track');
  });
});

// ── project health ──────────────────────────────────────────────────────

describe('computeProjectHealth', () => {
  it('computes totals, pctShipped, inFlight, blockedCount, lastActivityAt and sprint=none', () => {
    const cols = colMap([column(1, 1, { isDone: false }), column(2, 1, { isDone: true })]);
    const older = new Date('2026-08-10T00:00:00.000Z');
    const cards = [card(1, 1, 1, { updatedAt: older }), card(2, 1, 2, { updatedAt: older }), card(3, 1, 2, { updatedAt: older })]; // 1 open, 2 done
    const health = computeProjectHealth(
      project(1),
      cards,
      cols,
      new Set([1]), // card 1 blocked
      new Map([[1, new Date('2026-08-24T00:00:00.000Z').getTime()]]),
      null,
      NOW,
    );
    expect(health.totalCards).toBe(3);
    expect(health.shippedCards).toBe(2);
    expect(health.pctShipped).toBe(67);
    expect(health.inFlight).toBe(1);
    expect(health.blockedCount).toBe(1);
    expect(health.lastActivityAt).toBe(new Date('2026-08-24T00:00:00.000Z').toISOString());
    expect(health.sprint).toEqual({ id: null, name: null, endDate: null, status: 'none' });
  });

  it('reports the active sprint status when one exists', () => {
    const cols = colMap([column(1, 1, { isDone: false })]);
    const sprint: SprintRow = { id: 9, projectId: 1, name: 'Sprint 9', startDate: new Date('2026-08-21T12:00:00.000Z'), endDate: new Date('2026-08-29T12:00:00.000Z'), status: 'active' };
    const cards = [card(1, 1, 1, { sprintId: 9, storyPoints: 8 })]; // remaining=8 > expected 0.5*8=4 -> at_risk
    const health = computeProjectHealth(project(1), cards, cols, new Set(), new Map(), sprint, NOW);
    expect(health.sprint).toEqual({ id: 9, name: 'Sprint 9', endDate: sprint.endDate!.toISOString(), status: 'at_risk' });
  });

  it('pctShipped is 0 for an empty project', () => {
    const health = computeProjectHealth(project(1), [], new Map(), new Set(), new Map(), null, NOW);
    expect(health.pctShipped).toBe(0);
    expect(health.totalCards).toBe(0);
  });
});

// ── activity feed ───────────────────────────────────────────────────────

describe('buildActivityFeed', () => {
  it('sorts newest-first and caps at limit', () => {
    const cards = cardMap([card(1, 1, 1), card(2, 1, 1)]);
    const projects = projMap([project(1)]);
    const activities: ActivityRow[] = [
      { id: 1, cardId: 1, type: 'moved', actorId: 7, createdAt: new Date('2026-08-20T00:00:00.000Z') },
      { id: 2, cardId: 2, type: 'commented', actorId: 7, createdAt: new Date('2026-08-24T00:00:00.000Z') },
      { id: 3, cardId: 1, type: 'created', actorId: 7, createdAt: new Date('2026-08-22T00:00:00.000Z') },
    ];
    const feed = buildActivityFeed(activities, cards, projects, 2);
    expect(feed.map((a) => a.id)).toEqual([2, 3]);
    expect(feed[0].cardTitle).toBe('Card 2');
    expect(feed[0].projectName).toBe('Project 1');
  });

  it('skips activity for cards outside the fetched set', () => {
    const cards = cardMap([card(1, 1, 1)]);
    const projects = projMap([project(1)]);
    const activities: ActivityRow[] = [{ id: 1, cardId: 999, type: 'moved', actorId: null, createdAt: NOW }];
    expect(buildActivityFeed(activities, cards, projects, 50)).toEqual([]);
  });
});

// ── workload ────────────────────────────────────────────────────────────

describe('buildWorkload', () => {
  it('counts open (not-done) cards and overdue cards per assignee', () => {
    const cols = colMap([column(1, 1, { isDone: false }), column(2, 1, { isDone: true })]);
    const cards = [
      card(1, 1, 1, { dueDate: new Date('2026-08-01T00:00:00.000Z') }), // open + overdue
      card(2, 1, 1, { dueDate: new Date('2026-09-01T00:00:00.000Z') }), // open, not overdue
      card(3, 1, 2), // done — excluded
    ];
    const assignees: AssigneeRow[] = [
      { cardId: 1, userId: 10 },
      { cardId: 2, userId: 10 },
      { cardId: 3, userId: 10 }, // assigned but done, excluded
    ];
    const usersById = new Map<number, UserRow>([[10, { id: 10, name: 'Alice' }]]);
    const workload = buildWorkload(cards, cols, assignees, usersById, NOW);
    expect(workload).toEqual([{ userId: 10, name: 'Alice', openCards: 2, overdue: 1 }]);
  });

  it('falls back to a synthetic name when the user row is missing', () => {
    const cols = colMap([column(1, 1, { isDone: false })]);
    const cards = [card(1, 1, 1)];
    const assignees: AssigneeRow[] = [{ cardId: 1, userId: 42 }];
    const workload = buildWorkload(cards, cols, assignees, new Map(), NOW);
    expect(workload[0]).toEqual({ userId: 42, name: 'User 42', openCards: 1, overdue: 0 });
  });

  it('sorts by openCards descending', () => {
    const cols = colMap([column(1, 1, { isDone: false })]);
    const cards = [card(1, 1, 1), card(2, 1, 1), card(3, 1, 1)];
    const assignees: AssigneeRow[] = [{ cardId: 1, userId: 1 }, { cardId: 2, userId: 2 }, { cardId: 3, userId: 2 }];
    const usersById = new Map<number, UserRow>([[1, { id: 1, name: 'A' }], [2, { id: 2, name: 'B' }]]);
    const workload = buildWorkload(cards, cols, assignees, usersById, NOW);
    expect(workload.map((w) => w.userId)).toEqual([2, 1]);
  });
});

// ── milestones ──────────────────────────────────────────────────────────

describe('buildMilestones', () => {
  it('includes a project due date and a sprint end date within the horizon, sorted by date', () => {
    const projects = [
      project(1, { name: 'Alpha', dueDate: new Date('2026-09-10T00:00:00.000Z') }), // 16 days out
      project(2, { name: 'Beta', dueDate: new Date('2026-10-30T00:00:00.000Z') }), // > 60 days out
    ];
    const sprints: SprintRow[] = [
      { id: 1, projectId: 1, name: 'Sprint 1', startDate: null, endDate: new Date('2026-08-30T00:00:00.000Z'), status: 'active' }, // 5 days out
    ];
    const milestones = buildMilestones(projects, sprints, NOW, 60);
    expect(milestones).toEqual([
      { kind: 'sprint_end', projectId: 1, projectName: 'Alpha', name: 'Sprint 1', date: sprints[0].endDate!.toISOString() },
      { kind: 'project_due', projectId: 1, projectName: 'Alpha', name: 'Alpha', date: projects[0].dueDate!.toISOString() },
    ]);
  });

  it('excludes past dates', () => {
    const projects = [project(1, { name: 'Alpha', dueDate: new Date('2026-08-01T00:00:00.000Z') })];
    expect(buildMilestones(projects, [], NOW, 60)).toEqual([]);
  });
});
