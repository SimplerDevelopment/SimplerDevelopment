import { describe, it, expect } from 'vitest';
import { quickAddRequest, quickAddTargets } from '@/lib/portal/my-tasks-quick-add';
import type { MyTaskGroup } from '@/lib/portal/my-tasks-shape';

const g = (over: Partial<MyTaskGroup>): MyTaskGroup => ({ id: 1, source: 'kanban', name: 'Website relaunch', projectKey: 'WEB', clientName: null, cards: [], ...over });

describe('my-tasks quick-add (PUX-154)', () => {
  it('targets: every kanban group with a landing column, once; Brain only when enabled', () => {
    const t = quickAddTargets([
      g({ id: 1, defaultColumnId: 10 }),
      g({ id: 1, defaultColumnId: 10 }),                      // same project twice (paginated pages) → once
      g({ id: 2, name: 'Store', defaultColumnId: null }),     // board with no non-done column → cannot land a card
      g({ id: 'brain-deal-5', source: 'brain', name: 'Summit Bank' }),
    ], true);
    expect(t).toEqual([
      { key: 'kanban:1', label: 'Website relaunch', kind: 'kanban', columnId: 10 },
      { key: 'brain', label: 'Brain tasks', kind: 'brain' },
    ]);
    expect(quickAddTargets([], false)).toEqual([]);
  });

  it('request: kanban → /api/portal/cards {columnId,title}; brain → /api/portal/brain/tasks {title}; trimmed', () => {
    expect(quickAddRequest({ key: 'kanban:1', label: 'x', kind: 'kanban', columnId: 10 }, '  Draft the launch email ')).toEqual({ url: '/api/portal/cards', body: { columnId: 10, title: 'Draft the launch email' } });
    expect(quickAddRequest({ key: 'brain', label: 'Brain tasks', kind: 'brain' }, 'Pick the hero trips')).toEqual({ url: '/api/portal/brain/tasks', body: { title: 'Pick the hero trips' } });
  });
});
