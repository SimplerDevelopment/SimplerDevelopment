'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface CrmNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 45_000; // 45s — matches sibling polled widgets in portal
const LIST_LIMIT = 20;

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function entityUrl(entityType: string | null, entityId: number | null): string | null {
  if (!entityType || !entityId) return null;
  const base = '/portal/crm';
  switch (entityType) {
    case 'contact': return `${base}/contacts/${entityId}`;
    case 'deal': return `${base}/deals/${entityId}`;
    case 'company': return `${base}/companies/${entityId}`;
    case 'proposal': return `${base}/deals/${entityId}`;
    case 'mcp_approval': return `/portal/approvals?id=${entityId}`;
    case 'document': return `/portal/brain/notes/${entityId}`;
    default: return null;
  }
}

function typeIcon(type: string): string {
  switch (type) {
    case 'deal_stage_changed': return 'swap_horiz';
    case 'proposal_viewed': return 'visibility';
    case 'proposal_signed': return 'verified';
    case 'mention': return 'alternate_email';
    case 'document_comment_mention': return 'forum';
    case 'deal_assigned': return 'assignment_ind';
    case 'contact_created': return 'person_add';
    case 'mcp_pending_change': return 'fact_check';
    default: return 'notifications';
  }
}

// Human-readable label for a group header
function groupLabel(entityType: string | null, type: string): string {
  if (entityType) {
    switch (entityType) {
      case 'contact': return 'Contacts';
      case 'deal': return 'Deals';
      case 'company': return 'Companies';
      case 'proposal': return 'Proposals';
      case 'mcp_approval': return 'Pending approvals';
      case 'document': return 'Documents';
      default: return entityType.charAt(0).toUpperCase() + entityType.slice(1);
    }
  }
  switch (type) {
    case 'mention': return 'Mentions';
    case 'document_comment_mention': return 'Document mentions';
    case 'mcp_pending_change': return 'Pending approvals';
    default: return 'Other';
  }
}

interface NotificationGroup {
  key: string;
  label: string;
  items: CrmNotification[];
}

function groupNotifications(items: CrmNotification[]): NotificationGroup[] {
  const buckets = new Map<string, NotificationGroup>();
  for (const n of items) {
    const key = n.entityType ?? `type:${n.type}`;
    const label = groupLabel(n.entityType, n.type);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(n);
  }
  return Array.from(buckets.values());
}

export default function CrmNotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<CrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async (unreadOnly = false) => {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(LIST_LIMIT));
      if (unreadOnly) params.set('unreadOnly', 'true');
      const res = await fetch(`/api/portal/crm/notifications?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data ?? []);
        setUnreadCount(json.unreadCount ?? 0);
      }
    } catch {
      // silently ignore fetch errors for polling
    }
  }, []);

  // Initial fetch + polling for the badge count
  useEffect(() => {
    fetchNotifications(filterUnread);
    const interval = setInterval(() => fetchNotifications(filterUnread), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications, filterUnread]);

  // Refresh when the dropdown opens — gives users an immediate up-to-date view
  // even if they're between poll ticks.
  useEffect(() => {
    if (open) fetchNotifications(filterUnread);
  }, [open, filterUnread, fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  const markAllRead = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/crm/notifications/mark-all-read', {
        method: 'POST',
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const markOneRead = async (notificationId: number) => {
    try {
      await fetch(`/api/portal/crm/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
    } catch {
      // ignore — UI already optimistically updated
    }
  };

  const handleItemClick = async (notification: CrmNotification) => {
    if (!notification.read) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      markOneRead(notification.id);
    }
    const url = entityUrl(notification.entityType, notification.entityId);
    if (url) {
      setOpen(false);
      router.push(url);
    }
  };

  const handleMarkReadClick = async (e: React.MouseEvent, notification: CrmNotification) => {
    e.stopPropagation();
    if (notification.read) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    markOneRead(notification.id);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="material-icons text-muted-foreground text-xl">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              <button
                type="button"
                onClick={() => setFilterUnread((prev) => !prev)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  filterUnread
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
                aria-pressed={filterUnread}
              >
                {filterUnread ? 'Showing unread' : 'Show unread'}
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <span className="material-icons text-3xl text-muted-foreground/40 mb-2 block">
                  notifications_none
                </span>
                {filterUnread ? 'No unread notifications' : 'No notifications yet'}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.key}>
                  <div className="sticky top-0 bg-muted/40 backdrop-blur-sm px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                    {group.label}
                  </div>
                  {group.items.map((n) => {
                    const url = entityUrl(n.entityType, n.entityId);
                    return (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleItemClick(n)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleItemClick(n);
                          }
                        }}
                        className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-muted/50 transition-colors border-b border-border last:border-b-0 cursor-pointer ${
                          !n.read ? 'bg-primary/5' : ''
                        }`}
                      >
                        <span className="material-icons text-muted-foreground text-lg mt-0.5 shrink-0">
                          {typeIcon(n.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm truncate ${!n.read ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                              {n.title}
                            </span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
                            )}
                          </div>
                          {n.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                            {url && (
                              <span className="text-[11px] text-primary inline-flex items-center gap-0.5">
                                <span className="material-icons text-[12px] leading-none">arrow_outward</span>
                                Open
                              </span>
                            )}
                            {!n.read && (
                              <button
                                type="button"
                                onClick={(e) => handleMarkReadClick(e, n)}
                                className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5"
                                aria-label={`Mark notification "${n.title}" as read`}
                              >
                                <span className="material-icons text-[12px] leading-none">done</span>
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
