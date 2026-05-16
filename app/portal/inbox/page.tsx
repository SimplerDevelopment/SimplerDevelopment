'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span className="material-icons">forum</span>
            Inbox
          </h1>
          <p className="text-sm text-muted-foreground">Live chat conversations from your sites.</p>
        </div>
        <div className="flex gap-2">
          {widgets.length > 0 ? (
            <Link
              href={`/portal/inbox/widgets/${widgets[0].id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
            >
              <span className="material-icons text-base">settings</span>
              Widget settings
            </Link>
          ) : null}
        </div>
      </div>

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
          {widgets.length === 0
            ? 'No chat widgets yet — embed one on a site to start receiving messages.'
            : 'No conversations match this filter yet.'}
        </div>
      ) : (
        <ul className="divide-y border rounded-md bg-card">
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
    </div>
  );
}
