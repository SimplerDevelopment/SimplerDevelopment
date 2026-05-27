'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Notification {
  id: number;
  kind: string;
  cardId: number | null;
  projectId: number | null;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actorUserId: number | null;
  actorName: string | null;
}

const kindIcon: Record<string, string> = {
  'card.commented': 'comment',
  'comment.mention': 'alternate_email',
  'card.assignee_added': 'person_add',
  'card.due_date_changed': 'event',
  'card.sprint_changed': 'sprint',
  'card.column_changed': 'swap_horiz',
  'card.dependency_added': 'block',
};

const kindColor: Record<string, string> = {
  'comment.mention': 'text-violet-600',
  'card.commented': 'text-blue-600',
  'card.assignee_added': 'text-emerald-600',
  'card.due_date_changed': 'text-amber-600',
  'card.sprint_changed': 'text-indigo-600',
  'card.column_changed': 'text-slate-600',
  'card.dependency_added': 'text-red-600',
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/notifications${unreadOnly ? '?unread=1' : ''}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.data.rows);
        setUnread(data.data.unread);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [unreadOnly]);

  const markRead = async (id: number) => {
    await fetch('/api/portal/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setRows(prev => prev.map(r => r.id === id ? { ...r, readAt: new Date().toISOString() } : r));
    setUnread(u => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await fetch('/api/portal/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setRows(prev => prev.map(r => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">notifications</span>
            Inbox
            {unread > 0 && (
              <span className="text-sm bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-semibold">
                {unread}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Comments, mentions, assignments, and sprint updates from across your projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUnreadOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              unreadOnly ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <span className="material-icons text-sm">filter_list</span>
            {unreadOnly ? 'Unread only' : 'All'}
          </button>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-accent"
            >
              <span className="material-icons text-sm">done_all</span>
              Mark all read
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary">refresh</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">inbox</span>
          <h3 className="mt-4 font-semibold text-foreground">{unreadOnly ? 'No unread notifications' : 'Inbox is empty'}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {unreadOnly
              ? 'You\'re all caught up.'
              : 'You\'ll get a notification here when someone comments, mentions you, assigns you, or moves a card you\'re watching.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
          {rows.map(n => {
            const icon = kindIcon[n.kind] ?? 'notifications';
            const color = kindColor[n.kind] ?? 'text-muted-foreground';
            const href = n.cardId && n.projectId
              ? `/portal/projects/${n.projectId}?card=${n.cardId}`
              : n.projectId ? `/portal/projects/${n.projectId}` : '/portal/projects';
            return (
              <Link
                key={n.id}
                href={href}
                // Notification lists can run long and each item points at a
                // heavy project route — defer prefetch to hover.
                prefetch={false}
                onClick={() => { if (!n.readAt) markRead(n.id); }}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors ${
                  n.readAt ? '' : 'bg-primary/5'
                }`}
              >
                <span className={`material-icons text-base mt-0.5 ${color}`}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.readAt ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.readAt && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" aria-label="Unread" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
