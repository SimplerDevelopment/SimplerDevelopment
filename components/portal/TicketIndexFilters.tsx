'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface TicketIndexFiltersProps {
  isStaff: boolean;
  initial: {
    status: string;
    priority: string;
    assignee: string;
    overdue: boolean;
  };
}

const STATUSES = ['all', 'open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
const PRIORITIES = ['all', 'low', 'medium', 'high', 'urgent'] as const;

export default function TicketIndexFilters({ isStaff, initial }: TicketIndexFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (!value || value === 'all' || value === '') next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.push(qs ? `/portal/tickets?${qs}` : '/portal/tickets');
    },
    [params, router],
  );

  const toggleOverdue = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    if (initial.overdue) next.delete('overdue');
    else next.set('overdue', '1');
    const qs = next.toString();
    router.push(qs ? `/portal/tickets?${qs}` : '/portal/tickets');
  }, [params, router, initial.overdue]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={initial.status}
        onChange={(e) => update('status', e.target.value)}
        className="px-3 py-1.5 rounded-md border border-border bg-background"
        aria-label="Filter by status"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === 'all' ? 'All statuses' : s.replace('_', ' ')}
          </option>
        ))}
      </select>

      <select
        value={initial.priority}
        onChange={(e) => update('priority', e.target.value)}
        className="px-3 py-1.5 rounded-md border border-border bg-background"
        aria-label="Filter by priority"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p === 'all' ? 'All priorities' : p}
          </option>
        ))}
      </select>

      {isStaff && (
        <select
          value={initial.assignee}
          onChange={(e) => update('assignee', e.target.value)}
          className="px-3 py-1.5 rounded-md border border-border bg-background"
          aria-label="Filter by assignee"
        >
          <option value="all">All assignees</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
      )}

      <button
        type="button"
        onClick={toggleOverdue}
        className={`px-3 py-1.5 rounded-md border transition-colors ${
          initial.overdue
            ? 'border-destructive bg-destructive/10 text-destructive'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        <span className="material-icons text-sm align-middle mr-1">schedule</span>
        Overdue only
      </button>
    </div>
  );
}
