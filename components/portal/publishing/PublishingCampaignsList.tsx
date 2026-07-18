'use client';

// Publishing Command Center — campaigns list with inline create / edit /
// delete via the /api/portal/publishing/campaigns routes. CRUD posture is
// optimistic — fetch the live list on mount, update the local cache on each
// mutation, refetch on error.

import { useState, useCallback, useEffect } from 'react';
import CampaignEditor from './CampaignEditor';

export interface CampaignRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  cardCount: number;
}

export default function PublishingCampaignsList({
  initial,
  canManage,
}: {
  initial: CampaignRow[];
  canManage: boolean;
}) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>(initial);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/publishing/campaigns');
      const json = await r.json();
      if (r.ok && json.success) setCampaigns(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, []);

  useEffect(() => {
    // On mount, re-fetch to ensure the page mirrors any change made on a
    // different tab. Cheap; the server-rendered list is the initial state.
    void (async () => {
      try {
        const r = await fetch('/api/portal/publishing/campaigns');
        const json = await r.json();
        if (r.ok && json.success) setCampaigns(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh');
      }
    })();
  }, []);

  const onSaved = useCallback(async () => {
    setEditing(null);
    setShowNew(false);
    setError(null);
    await refresh();
  }, [refresh]);

  const onDelete = useCallback(
    async (id: number) => {
      if (!confirm('Delete this campaign? Linked cards keep their data; only the grouping is removed.')) {
        return;
      }
      try {
        const r = await fetch(`/api/portal/publishing/campaigns/${id}`, { method: 'DELETE' });
        const json = await r.json();
        if (!r.ok || !json.success) throw new Error(json.message || 'Delete failed');
        setCampaigns((cur) => cur.filter((c) => c.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Campaigns</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <span className="material-icons text-base">add</span>
            New campaign
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
          <span className="material-icons text-4xl text-gray-400">campaign</span>
          <h3 className="mt-2 text-base font-medium">No campaigns yet</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {canManage
              ? 'Click "New campaign" to create your first cross-channel grouping.'
              : 'Ask an owner or admin to create a campaign.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Cards</th>
                <th className="px-3 py-2 text-left">Range</th>
                {canManage && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-gray-500">{c.slug}</span>
                    </div>
                    {c.description && (
                      <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {c.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip status={c.status} />
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.cardCount}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                    {formatRange(c.startDate, c.endDate)}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        className="mr-2 inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                      >
                        <span className="material-icons text-sm">edit</span>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="inline-flex items-center gap-1 text-red-600 hover:underline text-xs"
                      >
                        <span className="material-icons text-sm">delete</span>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || showNew) && (
        <CampaignEditor
          campaign={editing}
          onSaved={onSaved}
          onCancel={() => {
            setEditing(null);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles =
    status === 'active'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      : status === 'completed'
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const fmt = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `from ${fmt(start)}`;
  return `until ${fmt(end!)}`;
}
