'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ticketStatusColor } from '@/lib/portal-utils';

interface Assignee {
  userId: number;
  name: string;
  email: string;
  role: string;
}

interface Props {
  ticketId: number;
  initialStatus: string;
  initialAssigneeId: number | null;
}

const STATUS_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'open', label: 'Open', icon: 'inbox' },
  { value: 'in_progress', label: 'In progress', icon: 'autorenew' },
  { value: 'waiting_on_customer', label: 'Waiting on customer', icon: 'hourglass_empty' },
  { value: 'resolved', label: 'Resolved', icon: 'task_alt' },
  { value: 'closed', label: 'Closed', icon: 'lock' },
];

export default function TicketStatusControl({ ticketId, initialStatus, initialAssigneeId }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [assigneeId, setAssigneeId] = useState<number | null>(initialAssigneeId);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState<'status' | 'assignee' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/tickets/${ticketId}/assignees`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setAssignees(json.data ?? []);
      })
      .catch(() => {
        // non-fatal — control will just show an empty dropdown
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  async function patch(patch: Record<string, unknown>, kind: 'status' | 'assignee') {
    setLoading(kind);
    setError('');
    try {
      const res = await fetch(`/api/portal/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? 'Update failed');
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setLoading(null);
    }
  }

  function handleStatusChange(value: string) {
    setStatus(value);
    patch({ status: value }, 'status');
  }

  function handleAssigneeChange(value: string) {
    const next = value === '' ? null : parseInt(value, 10);
    setAssigneeId(next);
    patch({ assigneeId: next }, 'assignee');
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="material-icons text-base">tune</span>
        Staff controls
      </div>

      {error && (
        <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive flex items-center gap-1">
          <span className="material-icons text-sm">error_outline</span>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-muted-foreground">
          Status
          <div className="mt-1 flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={loading === 'status'}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ticketStatusColor(status)}`}>
              {status.replace(/_/g, ' ')}
            </span>
          </div>
        </label>

        <label className="block text-xs font-medium text-muted-foreground">
          Assigned to
          <div className="mt-1 flex items-center gap-2">
            <select
              value={assigneeId ?? ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              disabled={loading === 'assignee'}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
            {loading === 'assignee' && (
              <span className="material-icons text-base animate-spin text-muted-foreground">refresh</span>
            )}
          </div>
        </label>
      </div>
    </div>
  );
}
