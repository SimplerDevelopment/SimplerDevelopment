'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

// Raw shapes returned by the two backing feeds.
interface PmRow {
  id: number;
  kind: string;
  cardId: number | null;
  projectId: number | null;
  title: string;
  body: string | null;
  payload: object | null;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
}

interface CrmItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
  createdAt: string;
}

// Unified shape both feeds are normalized into for shared rendering/merging.
interface UnifiedNotif {
  source: 'pm' | 'crm';
  id: number;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  url: string | null;
  icon: string;
  group: string;
}

const POLL_INTERVAL_MS = 45_000;
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

// --- PM feed helpers ---

function pmEntityUrl(cardId: number | null, projectId: number | null): string | null {
  if (cardId && projectId) return `/portal/projects/${projectId}?card=${cardId}`;
  if (projectId) return `/portal/projects/${projectId}`;
  return null;
}

function pmTypeIcon(kind: string): string {
  switch (kind) {
    case 'card.commented': return 'comment';
    case 'comment.mention': return 'alternate_email';
    case 'card.assignee_added': return 'assignment_ind';
    case 'card.due_date_changed': return 'event';
    case 'card.sprint_changed': return 'sprint';
    case 'card.column_changed': return 'swap_horiz';
    case 'card.dependency_added': return 'link';
    case 'billing.usage_alert': return 'data_usage';
    default: return 'notifications';
  }
}

function pmGroupLabel(kind: string): string {
  return kind === 'billing.usage_alert' ? 'Billing' : 'Projects & Tasks';
}

function normalizePm(row: PmRow): UnifiedNotif {
  return {
    source: 'pm',
    id: row.id,
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt,
    url: pmEntityUrl(row.cardId, row.projectId),
    icon: pmTypeIcon(row.kind),
    group: pmGroupLabel(row.kind),
  };
}

// --- CRM feed helpers (copied verbatim from CrmNotificationBell.tsx) ---

function crmEntityUrl(entityType: string | null, entityId: number | null): string | null {
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

function crmTypeIcon(type: string): string {
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

function crmGroupLabel(entityType: string | null, type: string): string {
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

function normalizeCrm(item: CrmItem): UnifiedNotif {
  return {
    source: 'crm',
    id: item.id,
    title: item.title,
    body: item.body,
    read: item.read,
    createdAt: item.createdAt,
    url: crmEntityUrl(item.entityType, item.entityId),
    icon: crmTypeIcon(item.type),
    group: crmGroupLabel(item.entityType, item.type),
  };
}

interface NotificationGroup {
  key: string;
  label: string;
  items: UnifiedNotif[];
}

function groupNotifications(items: UnifiedNotif[]): NotificationGroup[] {
  const buckets = new Map<string, NotificationGroup>();
  for (const n of items) {
    const key = n.group;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label: n.group, items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(n);
  }
  return Array.from(buckets.values());
}

export default function NotificationBell() {
  const router = useRouter();
  const { data: session } = useSession();
  // These feeds are portal (tenant-client) scoped. Staff/admin sessions can
  // browse /portal/** (e.g. to check on a client) but have no associated
  // portal client, so both backing routes 404 for them — skip the fetch
  // entirely rather than firing a request that can never succeed.
  const isPortalClient = session?.user?.role === 'client';
  const [notifications, setNotifications] = useState<UnifiedNotif[]>([]);
  const [pmUnread, setPmUnread] = useState(0);
  const [crmUnread, setCrmUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async (unreadOnly: boolean) => {
    if (!isPortalClient) return;
    const pmParams = new URLSearchParams();
    pmParams.set('limit', String(LIST_LIMIT));
    if (unreadOnly) pmParams.set('unread', '1');

    const crmParams = new URLSearchParams();
    crmParams.set('limit', String(LIST_LIMIT));
    if (unreadOnly) crmParams.set('unreadOnly', 'true');

    const [pmResult, crmResult] = await Promise.all([
      (async () => {
        try {
          const res = await fetch(`/api/portal/notifications?${pmParams.toString()}`);
          if (!res.ok) return null;
          const json = await res.json();
          if (!json.success) return null;
          return json.data as { rows: PmRow[]; unread: number };
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          const res = await fetch(`/api/portal/crm/notifications?${crmParams.toString()}`);
          if (!res.ok) return null;
          const json = await res.json();
          if (!json.success) return null;
          return { rows: json.data as CrmItem[], unread: json.unreadCount as number };
        } catch {
          return null;
        }
      })(),
    ]);

    const pmItems = (pmResult?.rows ?? []).map(normalizePm);
    const crmItems = (crmResult?.rows ?? []).map(normalizeCrm);
    const merged = [...pmItems, ...crmItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    setNotifications(merged);
    setPmUnread(pmResult?.unread ?? 0);
    setCrmUnread(crmResult?.unread ?? 0);
  }, [isPortalClient]);

  // Initial fetch + polling for the badge count / list
  useEffect(() => {
    void (async () => {
      await fetchAll(filterUnread);
    })();
    const interval = setInterval(() => fetchAll(filterUnread), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll, filterUnread]);

  // Refresh when the dropdown opens — gives users an immediate up-to-date view
  // even if they're between poll ticks.
  useEffect(() => {
    if (!open) return;
    void (async () => {
      await fetchAll(filterUnread);
    })();
  }, [open, filterUnread, fetchAll]);

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
  const unreadCount = pmUnread + crmUnread;

  const markAllRead = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetch('/api/portal/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true }),
        }).catch(() => null),
        fetch('/api/portal/crm/notifications/mark-all-read', { method: 'POST' }).catch(() => null),
      ]);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setPmUnread(0);
      setCrmUnread(0);
    } finally {
      setLoading(false);
    }
  };

  const markOneRead = async (notification: UnifiedNotif) => {
    try {
      if (notification.source === 'pm') {
        await fetch('/api/portal/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notification.id }),
        });
      } else {
        await fetch(`/api/portal/crm/notifications/${notification.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true }),
        });
      }
    } catch {
      // ignore — UI already optimistically updated
    }
  };

  const applyOptimisticRead = (notification: UnifiedNotif) => {
    setNotifications((prev) =>
      prev.map((n) => (n.source === notification.source && n.id === notification.id ? { ...n, read: true } : n))
    );
    if (notification.source === 'pm') {
      setPmUnread((prev) => Math.max(0, prev - 1));
    } else {
      setCrmUnread((prev) => Math.max(0, prev - 1));
    }
  };

  const handleItemClick = async (notification: UnifiedNotif) => {
    if (!notification.read) {
      applyOptimisticRead(notification);
      markOneRead(notification);
    }
    if (notification.url) {
      setOpen(false);
      router.push(notification.url);
    }
  };

  const handleMarkReadClick = async (e: React.MouseEvent, notification: UnifiedNotif) => {
    e.stopPropagation();
    if (notification.read) return;
    applyOptimisticRead(notification);
    markOneRead(notification);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {/* Both children are aria-hidden so the button's visible text is empty and
            the aria-label alone supplies the accessible name. Without this the
            unread count is visible text absent from the name, which fails axe's
            label-content-name-mismatch — it was the single most widespread a11y
            failure in the portal (147 of 162 screens), since this bell renders in
            the header on every page. The count belongs in the label, not beside it.
            The material-icons ligature text ("notifications") is decorative for the
            same reason. */}
        <span aria-hidden="true" className="material-icons text-muted-foreground text-xl">notifications</span>
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
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
                  {group.items.map((n) => (
                    <div
                      key={`${n.source}-${n.id}`}
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
                        {n.icon}
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
                          {n.url && (
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
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
