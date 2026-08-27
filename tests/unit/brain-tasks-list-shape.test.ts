import { describe, it, expect } from 'vitest';
import { proposedTasks, sortTasks } from '@/lib/brain/tasks-list-shape';

describe('brain tasks list shape (PUX-161)', () => {
  it('proposedTasks: only pending task-typed review items, shaped from the payload', () => {
    const out = proposedTasks([
      { id: 1, proposedType: 'task', status: 'pending', sourceType: 'meeting', proposedPayload: { title: 'Confirm rain plan', dueDate: '2026-09-03', priority: 'high' } },
      { id: 2, proposedType: 'decision', status: 'pending', proposedPayload: { title: 'x' } },
      { id: 3, proposedType: 'task', status: 'approved', proposedPayload: { title: 'y' } },
      { id: 4, proposedType: 'task', status: 'pending', proposedPayload: null },
    ]);
    expect(out).toEqual([
      { id: 1, title: 'Confirm rain plan', description: null, dueDate: '2026-09-03', priority: 'high', from: 'From a call' },
      { id: 4, title: 'Untitled task', description: null, dueDate: null, priority: null, from: 'From the Brain' },
    ]);
  });
  it('sortTasks: open by due date then priority, undated last, done at the bottom; input untouched', () => {
    const t = [
      { id: 'done', status: 'done', dueDate: '2026-08-01', priority: 'urgent' },
      { id: 'undated-high', status: 'open', dueDate: null, priority: 'high' },
      { id: 'soon-low', status: 'in_progress', dueDate: '2026-08-29', priority: 'low' },
      { id: 'soon-urgent', status: 'blocked', dueDate: '2026-08-29', priority: 'urgent' },
      { id: 'later', status: 'open', dueDate: '2026-09-10', priority: 'medium' },
    ];
    const snap = JSON.stringify(t);
    expect(sortTasks(t).map((x) => x.id)).toEqual(['soon-urgent', 'soon-low', 'later', 'undated-high', 'done']);
    expect(JSON.stringify(t)).toBe(snap);
  });
});
