import { describe, it, expect } from 'vitest';
import { fromTaskGroups, fromNeedsYou, fromReviewItems, bucketOf, groupByWhen } from '@/lib/work/inbox';

const now = new Date('2026-08-28T12:00:00Z');

describe('work inbox (PUX-198)', () => {
  it('normalises the queues and skips done cards', () => {
    const rows = fromTaskGroups([{ id: 1, source: 'kanban', name: 'Site', projectKey: 'S', clientName: null, cards: [
      { id: 1, source: 'kanban', key: 'S-1', title: 'Fix hero', priority: null, dueDate: '2026-08-28T09:00:00Z', columnName: 'Doing', columnIsDone: false, labels: [], checklist: null, linkUrl: '/portal/projects/1?card=1', doneColumnId: null },
      { id: 2, source: 'kanban', key: 'S-2', title: 'Done thing', priority: null, dueDate: null, columnName: 'Done', columnIsDone: true, labels: [], checklist: null, linkUrl: '/x', doneColumnId: null },
    ] } as any]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'projects', meta: 'Site · Doing', href: '/portal/projects/1?card=1' });
    expect(fromNeedsYou([{ kind: 'reply', key: 'reply:7', title: 'Ticket', meta: 'waiting', href: '/portal/tickets/7', cta: 'Reply', at: now, urgent: true }])[0].source).toBe('tickets');
    expect(fromReviewItems([{ id: 3, proposedType: 'note_update', createdAt: now }])[0].title).toBe('Review a suggested note update');
  });
  it('buckets by when and orders soonest first, undated last', () => {
    expect(bucketOf(new Date('2026-08-27T00:00:00Z'), now)).toBe('Today'); // overdue lands in Today
    expect(bucketOf(new Date('2026-09-02T00:00:00Z'), now)).toBe('This week');
    expect(bucketOf(new Date('2026-09-20T00:00:00Z'), now)).toBe('Later');
    expect(bucketOf(null, now)).toBe('Later');
    const g = groupByWhen([
      { key: 'a', source: 'projects', title: 'later', meta: '', href: '/', at: new Date('2026-09-20T00:00:00Z') },
      { key: 'b', source: 'projects', title: 'none', meta: '', href: '/', at: null },
      { key: 'c', source: 'tickets', title: 'today', meta: '', href: '/', at: new Date('2026-08-28T08:00:00Z') },
    ], now);
    expect(g.map(([b, r]) => `${b}:${r.map((x) => x.key).join(',')}`)).toEqual(['Today:c', 'Later:a,b']);
  });
});
