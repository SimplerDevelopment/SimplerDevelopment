'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard } from '@/components/portal/portal-ui';

interface Site {
  id: number;
  name: string;
}

interface Conversation {
  id: number;
  widgetId: number;
  visitorId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: 'open' | 'assigned' | 'closed';
  assignedUserId: number | null;
  lastMessageAt: string;
  createdAt: string;
}

interface Widget {
  id: number;
  siteId: number;
  enabled: boolean;
  primaryColor: string;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'closed', label: 'Closed' },
] as const;

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]['id']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create-widget modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadConversations(status: string) {
    const url = `/api/portal/chat/conversations${status === 'all' ? '' : `?status=${status}`}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Failed to load conversations');
    setConversations(json.data as Conversation[]);
  }

  // Initial widget list — drives the empty state and the "Settings" link.
  useEffect(() => {
    fetch('/api/portal/chat/widgets')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setWidgets(j.data as Widget[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadConversations(filter);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  // Live updates via SSE — bump unread / new conversations into the list.
  useEffect(() => {
    const es = new EventSource('/api/portal/chat/inbox-stream');
    es.addEventListener('conversation', () => {
      // Cheapest correct strategy: refetch the active filter.
      void loadConversations(filter);
    });
    es.addEventListener('message', () => {
      void loadConversations(filter);
    });
    es.onerror = () => {
      // EventSource auto-retries.
    };
    return () => es.close();
  }, [filter]);

  const empty = useMemo(() => !loading && conversations.length === 0, [loading, conversations.length]);

  const openCreateModal = async () => {
    setCreateError(null);
    setSelectedSiteId('');
    setShowCreateModal(true);
    try {
      const res = await fetch('/api/portal/cms/websites');
      const json = await res.json();
      if (json.success) setSites(json.data as Site[]);
    } catch {
      // non-critical — user can still type a site id if needed
    }
  };

  const createWidget = async () => {
    if (!selectedSiteId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/portal/chat/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: Number(selectedSiteId) }),
      });
      const json = await res.json();
      if (!json.success) {
        setCreateError(json.message ?? 'Failed to create widget');
        return;
      }
      setWidgets((prev) => [...prev, json.data as Widget]);
      setShowCreateModal(false);
    } catch {
      setCreateError('Network error — please try again');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <PortalPageHeader
        eyebrow="LIVE CHAT"
        title="Inbox"
        subtitle="Live chat conversations from your sites."
        actions={
          widgets.length > 0 ? (
            <Link
              href={`/portal/inbox/widgets/${widgets[0].id}`}
              className={pBtnGhost}
            >
              <span className="material-icons text-base">settings</span>
              Widget settings
            </Link>
          ) : (
            <button
              type="button"
              onClick={openCreateModal}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">add</span>
              Create widget
            </button>
          )
        }
      />

      <div className="flex gap-2 border-b overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
              filter === f.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">{error}</div>
      )}

      {empty ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons text-4xl mb-2 block">inbox</span>
          {widgets.length === 0 ? (
            <div className="space-y-3">
              <p>No chat widgets yet. Create one and embed it on a site to start receiving messages.</p>
              <button
                type="button"
                onClick={openCreateModal}
                className={pBtnPrimary}
              >
                <span className="material-icons text-base">add</span>
                Create widget
              </button>
            </div>
          ) : (
            'No conversations match this filter yet.'
          )}
        </div>
      ) : (
        <ul className={`divide-y ${pCard}`}>
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/inbox/${c.id}`}
                className="flex items-start gap-3 p-3 hover:bg-accent transition-colors"
              >
                <span className="material-icons text-muted-foreground mt-0.5">
                  {c.status === 'closed' ? 'mark_chat_read' : 'chat'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{c.visitorName || 'Anonymous visitor'}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        c.status === 'open'
                          ? 'bg-green-100 text-green-800'
                          : c.status === 'assigned'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.visitorEmail || `Visitor ${c.visitorId}`}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(c.lastMessageAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Create widget modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-extrabold tracking-[-0.01em]">Create chat widget</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <span className="material-icons text-lg">close</span>
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              A chat widget lets visitors on your site start live conversations. Select which site to attach it to.
            </p>
            <div className="space-y-2">
              <label htmlFor="widget-site" className="text-sm font-medium">Site</label>
              {sites.length > 0 ? (
                <select
                  id="widget-site"
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a site…</option>
                  {sites.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No sites found.{' '}
                  <Link href="/portal/websites" className="underline hover:text-foreground" onClick={() => setShowCreateModal(false)}>
                    Create a site first.
                  </Link>
                </p>
              )}
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className={pBtnGhost}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createWidget}
                disabled={!selectedSiteId || creating}
                className={pBtnPrimary}
              >
                {creating ? 'Creating…' : 'Create widget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
