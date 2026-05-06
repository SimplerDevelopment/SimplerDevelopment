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
