'use client';

import { useEffect, useState } from 'react';

interface Webhook {
  id: number;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  lastFiredAt: string | null;
  lastStatus: number | null;
  failureCount: number;
  createdAt: string;
}

const EVENT_OPTIONS = [
  'card.created',
  'card.title_changed',
  'card.description_changed',
  'card.priority_changed',
  'card.due_date_changed',
  'card.column_changed',
  'card.sprint_changed',
  'card.assigned',
  'card.unassigned',
  'card.assignee_added',
  'card.assignee_removed',
  'card.label_added',
  'card.label_removed',
  'card.commented',
  'card.checklist_item_completed',
  'card.dependency_added',
  'card.dependency_removed',
];

export default function ProjectWebhooksPanel({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<Webhook | null>(null);

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/webhooks`)
      .then(r => r.json())
      .then(d => { if (d.success) setHooks(d.data); })
      .finally(() => setLoading(false));
  }, [projectId]);

  async function create() {
    if (!newUrl.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/portal/projects/${projectId}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newUrl.trim(), events: [...newEvents] }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.success) {
      setJustCreated(data.data);
      setHooks(prev => [{ ...data.data, secret: data.data.secret.slice(0, 6) + '…' }, ...prev]);
      setNewUrl('');
      setNewEvents(new Set());
      setShowForm(false);
    }
  }

  async function toggleActive(id: number, active: boolean) {
    const res = await fetch(`/api/portal/project-webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    const d = await res.json();
    if (d.success) setHooks(prev => prev.map(h => h.id === id ? { ...h, active, failureCount: active ? 0 : h.failureCount } : h));
  }

  async function remove(id: number) {
    if (!confirm('Delete this webhook?')) return;
    await fetch(`/api/portal/project-webhooks/${id}`, { method: 'DELETE' });
    setHooks(prev => prev.filter(h => h.id !== id));
  }

  function toggleEvent(ev: string) {
    setNewEvents(prev => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev); else next.add(ev);
      return next;
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">Webhooks</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Get notified on card events. POSTs signed with <code className="bg-muted px-1 rounded">X-SimplerDev-Signature: sha256=…</code>.</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
            <span className="material-icons text-base">{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancel' : 'New webhook'}
          </button>
        )}
      </div>

      {justCreated && (
        <div className="p-4 border-b border-border bg-amber-50 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Copy this secret now — it will not be shown again.</p>
          <code className="block mt-2 text-xs bg-card border border-border rounded p-2 break-all">{justCreated.secret}</code>
          <button onClick={() => setJustCreated(null)} className="mt-2 text-xs text-amber-900 dark:text-amber-200 underline">Dismiss</button>
        </div>
      )}

      {showForm && canEdit && (
        <div className="p-4 border-b border-border space-y-3 bg-muted/30">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://example.com/hook"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Events (leave empty to subscribe to all)</label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_OPTIONS.map(ev => (
                <button key={ev} onClick={() => toggleEvent(ev)}
                  className={`text-xs px-2 py-0.5 rounded-full border font-mono ${newEvents.has(ev) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {ev}
                </button>
              ))}
            </div>
          </div>
          <button onClick={create} disabled={creating || !newUrl.trim()}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create webhook'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center"><span className="material-icons animate-spin text-muted-foreground">refresh</span></div>
      ) : hooks.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground text-center italic">No webhooks configured.</p>
      ) : (
        <ul className="divide-y divide-border">
          {hooks.map(h => (
            <li key={h.id} className="p-4 flex items-start gap-3">
              <span className={`material-icons text-base mt-0.5 ${h.active ? 'text-green-600' : 'text-muted-foreground'}`}>
                {h.active ? 'check_circle' : 'pause_circle'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-mono truncate">{h.url}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {h.events.length === 0
                    ? <span>All events</span>
                    : h.events.map(ev => <span key={ev} className="bg-muted rounded px-1.5 py-0.5 font-mono">{ev}</span>)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex gap-3">
                  {h.lastFiredAt && <span>Last fired {new Date(h.lastFiredAt).toLocaleString()} · {h.lastStatus ?? '—'}</span>}
                  {h.failureCount > 0 && <span className="text-destructive">{h.failureCount} recent failure{h.failureCount === 1 ? '' : 's'}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(h.id, !h.active)}
                    className="text-xs px-2 py-1 rounded border border-border hover:bg-accent text-foreground">
                    {h.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => remove(h.id)} className="p-1 rounded text-muted-foreground hover:text-destructive" aria-label="Delete">
                    <span className="material-icons text-base">delete_outline</span>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
