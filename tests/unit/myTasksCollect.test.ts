// @vitest-environment node
/**
 * Unit tests for the pure helpers in lib/portal/my-tasks-collect.ts. The
 * DB-touching collectors (collectKanbanTasks, collectBrainTasks) are exercised
 * at the e2e layer in tests/e2e/portal-my-tasks.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  statusToColumn,
  brainGroupId,
  brainTaskLinkUrl,
  kanbanCardLinkUrl,
  parseMyTasksParams,
  cardMatchesFilters,
  compareCardsByDue,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  type MyTaskCard,
} from '@/lib/portal/my-tasks-shape';

describe('statusToColumn', () => {
  it('maps each brain task status to its display label', () => {
    expect(statusToColumn('open')).toBe('Open');
    expect(statusToColumn('in_progress')).toBe('In Progress');
    expect(statusToColumn('blocked')).toBe('Blocked');
    expect(statusToColumn('done')).toBe('Done');
  });
});

describe('brainGroupId', () => {
  it('prefers dealId when both deal and company are set', () => {
    expect(brainGroupId({ dealId: 7, companyId: 42 })).toBe('brain-deal-7');
  });

  it('uses companyId when no dealId', () => {
    expect(brainGroupId({ dealId: null, companyId: 42 })).toBe('brain-company-42');
  });

  it('falls back to brain-uncategorized when neither is set', () => {
    expect(brainGroupId({ dealId: null, companyId: null })).toBe('brain-uncategorized');
  });

  it('group ids do NOT collide with numeric project ids', () => {
    // String prefixes guarantee no overlap with `id: number` from kanban projects.
    expect(brainGroupId({ dealId: 1, companyId: null })).toMatch(/^brain-/);
    expect(brainGroupId({ dealId: null, companyId: 1 })).toMatch(/^brain-/);
    expect(brainGroupId({ dealId: null, companyId: null })).toMatch(/^brain-/);
  });
});

describe('brainTaskLinkUrl', () => {
  it('builds a deep link with the task id as query param', () => {
    expect(brainTaskLinkUrl(123)).toBe('/portal/brain/tasks?task=123');
  });
});

describe('kanbanCardLinkUrl', () => {
  it('builds a project link with card focus query', () => {
    expect(kanbanCardLinkUrl(5, 99)).toBe('/portal/projects/5?card=99');
  });
});

describe('parseMyTasksParams', () => {
  const sp = (query: string) => new URLSearchParams(query);

  it('returns sane defaults on an empty querystring', () => {
    const p = parseMyTasksParams(sp(''));
    expect(p.source).toBe('all');
    expect(p.projectIds).toEqual([]);
    expect(p.priorities).toEqual([]);
    expect(p.overdue).toBe(false);
    expect(p.openOnly).toBe(true);
    expect(p.limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(p.cursor).toBe(0);
  });

  it('coerces source to a known value', () => {
    expect(parseMyTasksParams(sp('source=brain')).source).toBe('brain');
    expect(parseMyTasksParams(sp('source=kanban')).source).toBe('kanban');
    expect(parseMyTasksParams(sp('source=all')).source).toBe('all');
    // unknown → all
    expect(parseMyTasksParams(sp('source=garbage')).source).toBe('all');
  });

  it('parses comma-separated projectIds and drops invalid entries', () => {
    expect(parseMyTasksParams(sp('projectIds=1,2,abc,-3,4')).projectIds).toEqual([1, 2, 4]);
  });

  it('whitelists priorities', () => {
    expect(parseMyTasksParams(sp('priorities=low,high,bogus,URGENT')).priorities)
      .toEqual(['low', 'high', 'urgent']);
  });

  it('treats overdue=1 / true as on; everything else off', () => {
    expect(parseMyTasksParams(sp('overdue=1')).overdue).toBe(true);
    expect(parseMyTasksParams(sp('overdue=true')).overdue).toBe(true);
    expect(parseMyTasksParams(sp('overdue=0')).overdue).toBe(false);
    expect(parseMyTasksParams(sp('overdue=false')).overdue).toBe(false);
  });

  it('openOnly defaults true; openOnly=0 disables', () => {
    expect(parseMyTasksParams(sp('')).openOnly).toBe(true);
    expect(parseMyTasksParams(sp('openOnly=0')).openOnly).toBe(false);
    expect(parseMyTasksParams(sp('openOnly=1')).openOnly).toBe(true);
  });

  it('clamps limit to [1, MAX_PAGE_LIMIT] and falls back to default', () => {
    expect(parseMyTasksParams(sp('limit=10')).limit).toBe(10);
    expect(parseMyTasksParams(sp('limit=99999')).limit).toBe(MAX_PAGE_LIMIT);
    expect(parseMyTasksParams(sp('limit=-5')).limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseMyTasksParams(sp('limit=foo')).limit).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('cursor defaults to 0 and rejects garbage', () => {
    expect(parseMyTasksParams(sp('cursor=50')).cursor).toBe(50);
    expect(parseMyTasksParams(sp('cursor=-2')).cursor).toBe(0);
    expect(parseMyTasksParams(sp('cursor=foo')).cursor).toBe(0);
  });
});

describe('cardMatchesFilters', () => {
  const baseCard: MyTaskCard = {
    id: 1,
    source: 'kanban',
    key: null,
    title: 't',
    priority: 'medium',
    dueDate: null,
    columnName: null,
    columnIsDone: false,
    labels: [],
    checklist: null,
    linkUrl: '/x',
    doneColumnId: null,
  };

  it('passes through when no filters are active', () => {
    expect(cardMatchesFilters(baseCard, { priorities: [], overdue: false })).toBe(true);
  });

  it('keeps cards with matching priority, drops mismatches', () => {
    expect(cardMatchesFilters({ ...baseCard, priority: 'high' }, { priorities: ['high'], overdue: false })).toBe(true);
    expect(cardMatchesFilters({ ...baseCard, priority: 'low' }, { priorities: ['high'], overdue: false })).toBe(false);
  });

  it('overdue=true requires a dueDate strictly in the past', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect(cardMatchesFilters({ ...baseCard, dueDate: past }, { priorities: [], overdue: true })).toBe(true);
    expect(cardMatchesFilters({ ...baseCard, dueDate: future }, { priorities: [], overdue: true })).toBe(false);
    expect(cardMatchesFilters({ ...baseCard, dueDate: null }, { priorities: [], overdue: true })).toBe(false);
  });
});

describe('compareCardsByDue', () => {
  const mk = (id: number, due: string | null): MyTaskCard => ({
    id,
    source: 'kanban',
    key: null,
    title: '',
    priority: null,
    dueDate: due,
    columnName: null,
    columnIsDone: false,
    labels: [],
    checklist: null,
    linkUrl: '',
    doneColumnId: null,
  });

  it('sorts dueDate ASC NULLS LAST with id tiebreak', () => {
    const a = mk(2, '2026-01-01');
    const b = mk(1, '2026-01-01');
    const c = mk(3, '2026-02-01');
    const d = mk(4, null);
    const sorted = [d, c, a, b].sort(compareCardsByDue).map((x) => x.id);
    // a and b share due date, b has lower id → b before a; then c, then d (null last).
    expect(sorted).toEqual([1, 2, 3, 4]);
  });
});
