import { describe, it, expect } from 'vitest';
import { shapeProjectRollup } from '@/lib/projects/list-rollup-shape';

describe('shapeProjectRollup (PUX-151)', () => {
  it('rolls lanes, progress, last activity and members up per project', () => {
    const r = shapeProjectRollup(
      [
        { projectId: 1, name: 'Shipped', order: 4, isDone: true, count: 12 },
        { projectId: 1, name: 'Backlog', order: 0, isDone: false, count: 4 },
        { projectId: 1, name: 'Planned', order: 1, isDone: false, count: 2 },
        { projectId: 1, name: 'In progress', order: 2, isDone: false, count: 3 },
        { projectId: 1, name: 'Validating', order: 3, isDone: false, count: 1 },
        { projectId: 1, name: 'Blocked', order: 5, isDone: false, count: 0 }, // empty lane → not listed
        { projectId: 2, name: 'Backlog', order: 0, isDone: false, count: 0 },  // empty board
      ],
      [
        { projectId: 1, at: '2026-08-27T10:00:00Z' },
        { projectId: 1, at: new Date('2026-08-27T12:00:00Z') }, // the newer of the two sources wins
        { projectId: 2, at: null },
      ],
      [
        { projectId: 1, userId: 7, name: 'Sam Ortiz' },
        { projectId: 1, userId: 7, name: 'Sam Ortiz' }, // duplicate pair
        { projectId: 1, userId: 8, name: 'Jonah Reyes' },
        { projectId: 1, userId: 9, name: null },
        { projectId: 1, userId: 10, name: 'Fourth Person' }, // capped at three
      ],
    );
    expect(r[1]).toEqual({
      total: 22, shipped: 12, pct: 55,
      lanes: [{ name: 'Backlog', count: 4 }, { name: 'Planned', count: 2 }, { name: 'In progress', count: 3 }, { name: 'Validating', count: 1 }],
      lastActivityAt: '2026-08-27T12:00:00.000Z',
      members: [{ id: 7, name: 'Sam Ortiz' }, { id: 8, name: 'Jonah Reyes' }, { id: 9, name: 'Someone' }],
    });
    expect(r[2]).toEqual({ total: 0, shipped: 0, pct: 0, lanes: [], lastActivityAt: null, members: [] });
  });
});
