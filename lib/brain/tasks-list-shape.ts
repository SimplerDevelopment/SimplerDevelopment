// Brain tasks as a list, pure half (PUX-161, design doc screen 20): "due date
// and priority are what a client scans for, not a column position." Plus the
// task-typed review proposals the Brain wants a yes on. No I/O.
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export interface ProposedTask { id: number; title: string; description: string | null; dueDate: string | null; priority: string | null; from: string }

type ReviewItemLike = { id: number; proposedType: string; status: string; sourceType?: string | null; proposedPayload: Record<string, unknown> | null };

/** Pending review items the Brain proposed AS TASKS, shaped for the gold section. */
export function proposedTasks(items: ReviewItemLike[]): ProposedTask[] {
  return items
    .filter((i) => i.proposedType === 'task' && i.status === 'pending')
    .map((i) => {
      const p = i.proposedPayload ?? {};
      return {
        id: i.id,
        title: String(p.title ?? 'Untitled task'),
        description: p.description ? String(p.description) : null,
        dueDate: p.dueDate ? String(p.dueDate) : null,
        priority: p.priority ? String(p.priority) : null,
        from: i.sourceType === 'meeting' ? 'From a call' : 'From the Brain',
      };
    });
}

/** Open work first — soonest due, then priority, undated last — and done at the bottom. */
export function sortTasks<T extends { status: string; dueDate: string | Date | null; priority: string | null }>(tasks: T[]): T[] {
  const due = (t: T) => (t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY);
  const rank = (t: T) => PRIORITY_RANK[t.priority ?? ''] ?? 4;
  return [...tasks].sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    return due(a) - due(b) || rank(a) - rank(b) || a.status.localeCompare(b.status);
  });
}
