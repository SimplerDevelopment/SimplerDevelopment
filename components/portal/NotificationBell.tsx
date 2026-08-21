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

// Visible tabs poll at the original cadence; hidden tabs back off but keep
// polling — a backgrounded tab is precisely when a desktop notification earns
// its keep, so pausing on `hidden` would defeat the feature.
const POLL_INTERVAL_MS = 45_000;
const HIDDEN_POLL_INTERVAL_MS = 120_000;
const LIST_LIMIT = 20;

const DESKTOP_PREF_KEY = 'portal:desktopNotifications';

/**
 * Which PM notification kinds are worth interrupting someone with an OS-level
 * toast. Deliberately narrower than the email set in lib/pm-notifications.ts:
 * agents are instructed to leave their working trail as card comments
 * (`kanban_card_add_comment`) and to move cards through lanes
 * (`kanban_move_card`), and both flow through the same notifyCardEvent path.
 * Toasting on those would mean a popup per agent breadcrumb. These two mean a
 * human wants *you* specifically.
 */
const DESKTOP_TOAST_KINDS = new Set(['comment.mention', 'card.assignee_added']);

// Trimmed row shape returned by /api/portal/notifications/tick.
export interface TickRow {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  cardId: number | null;
  projectId: number | null;
  createdAt: string;
}

/**
 * Pure toast policy — which rows deserve a desktop notification this tick.
 *
 * `lastSeenId === null` means this is the first tick of the session: return
 * nothing and let the caller record the watermark. Without that, opening the
 * portal would fire a burst of toasts for a backlog of old notifications —
 * very visible for staff accounts, whose bell was showing nothing at all until
 * the role-guard fix below.
 *
 * Exported for unit tests so the policy can be checked without standing up a
 * jsdom `Notification` mock.
 */
export function toastableRows(latest: TickRow[], lastSeenId: number | null): TickRow[] {
  if (lastSeenId === null) return [];
  return latest
    .filter((r) => r.id > lastSeenId && DESKTOP_TOAST_KINDS.has(r.kind))
    .sort((a, b) => a.id - b.id);
}

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
  // Only the CRM feed is tenant-client scoped: it queries (clientId, userId)
  // and 404s for a session with no portal client. The PM feed is NOT — it
  // reads `notifications` by userId alone, so it works for every authenticated
  // role. Gating both on `role === 'client'` (as this did until PUX-090) left
  // admin/employee sessions with a permanently empty bell while notifyCardEvent
  // was writing rows addressed to them. Roles are admin | employee | client.
  const canFetchCrm = session?.user?.role === 'client';
  const [notifications, setNotifications] = useState<UnifiedNotif[]>([]);
  const [pmUnread, setPmUnread] = useState(0);
  const [crmUnread, setCrmUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  // One object rather than three booleans: they're always read together and
  // always written together, and it keeps the client-only adoption below to a
  // single setState.
  const [desktop, setDesktop] = useState({ supported: false, enabled: false, blocked: false });
  const containerRef = useRef<HTMLDivElement>(null);
  // Highest notification id this session has already accounted for. A ref, not
  // state, so advancing it never re-renders or re-creates the poll callback.
  const lastSeenIdRef = useRef<number | null>(null);
  // Mirrors desktopEnabled so `tick` can read it without listing it as a dep
  // (which would tear down and rebuild the polling timer on every toggle).
  const desktopEnabledRef = useRef(false);
  // Same reasoning for the router: `useRouter()` is stable in the real app but
  // nothing guarantees it, and a router in the dep chain would rebuild the
  // poll timer on every render — resetting the interval so it never actually
  // elapses. Held in a ref so `fireToast` and `tick` stay referentially stable.
  const routerRef = useRef(router);

  const fetchAll = useCallback(async (unreadOnly: boolean) => {
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
        if (!canFetchCrm) return null;
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
    setListLoaded(true);
  }, [canFetchCrm]);

  useEffect(() => {
    desktopEnabledRef.current = desktop.enabled;
  }, [desktop.enabled]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Restore the per-device toggle. Permission is per-origin/per-device and can
  // be revoked in browser settings behind our back, so the stored flag is only
  // honoured when the live permission still agrees.
  // `Notification.permission` and localStorage are client-only. Reading them in
  // a lazy useState initializer would throw during SSR and, past that, hydrate
  // to a different value than the server rendered — so adopting a browser-only
  // value in an effect is correct here, not the cascading-render smell the rule
  // is aimed at.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setDesktop({
      supported: true,
      blocked: Notification.permission === 'denied',
      enabled:
        window.localStorage.getItem(DESKTOP_PREF_KEY) === '1' &&
        Notification.permission === 'granted',
    });
  }, []);

  const fireToast = useCallback((row: TickRow) => {
    const url = pmEntityUrl(row.cardId, row.projectId);
    try {
      const toast = new Notification(row.title, {
        body: row.body ?? undefined,
        // Collapse repeats for one card into a single toast instead of
        // stacking a column of near-identical popups.
        tag: row.cardId ? `card-${row.cardId}` : `notif-${row.id}`,
        icon: '/iconLogo.png',
      });
      toast.onclick = () => {
        window.focus();
        if (url) routerRef.current.push(url);
        toast.close();
      };
    } catch {
      // Some browsers throw on construction (e.g. Android Chrome requires a
      // service worker). Failing to toast must never break the badge poll.
    }
  }, []);

  /**
   * One poll: counts for the badge, plus the few newest PM rows so we can
   * decide whether to toast. Cheap enough to keep running in a hidden tab.
   */
  const tick = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/notifications/tick');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;
      const data = json.data as { pmUnread: number; crmUnread: number; latest: TickRow[] };

      setPmUnread(data.pmUnread ?? 0);
      // The tick route resolves the CRM count through getPortalClient, which
      // honours staff impersonation — so it can report a count for a session
      // whose dropdown never lists CRM rows (the list is gated on the session
      // role, not the impersonated client). Ignore it in that case rather than
      // showing a badge the list can't account for.
      setCrmUnread(canFetchCrm ? data.crmUnread ?? 0 : 0);

      const latest = data.latest ?? [];
      if (desktopEnabledRef.current) {
        for (const row of toastableRows(latest, lastSeenIdRef.current)) fireToast(row);
      }
      // Advance the watermark even when toasts are off, so switching the
      // toggle on doesn't replay everything that arrived while it was off.
      if (latest.length > 0) {
        lastSeenIdRef.current = Math.max(...latest.map((r) => r.id));
      }
    } catch {
      // Offline / navigating away — next tick retries.
    }
  }, [fireToast, canFetchCrm]);

  // Self-rescheduling poll rather than a fixed setInterval, so the delay can
  // follow tab visibility and so a slow response can't stack up overlapping
  // requests.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const run = async () => {
      await tick();
      if (stopped) return;
      const delay =
        document.visibilityState === 'hidden' ? HIDDEN_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
      timer = setTimeout(run, delay);
    };

    const onVisibilityChange = () => {
      // Returning to the tab shouldn't wait out a long hidden-tab delay that's
      // already in flight.
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      void run();
    };

    void run();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tick]);

  // The full row list is only needed once the dropdown is actually open — the
  // badge runs off the tick above. This is what took the steady-state poll from
  // two 20-row payloads every 45s down to one count-sized one.
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

  const toggleDesktop = async () => {
    if (desktop.enabled) {
      setDesktop((prev) => ({ ...prev, enabled: false }));
      window.localStorage.setItem(DESKTOP_PREF_KEY, '0');
      return;
    }
    // Safari only honours requestPermission() when it originates from a user
    // gesture — this click IS that gesture, which is why the prompt lives on a
    // button and is never hoisted into an effect. (Chrome also downranks sites
    // that prompt unprompted on load.)
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setDesktop((prev) => ({ ...prev, blocked: permission === 'denied' }));
      return;
    }
    setDesktop((prev) => ({ ...prev, blocked: false, enabled: true }));
    window.localStorage.setItem(DESKTOP_PREF_KEY, '1');
  };

  const markAllRead = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetch('/api/portal/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true }),
        }).catch(() => null),
        canFetchCrm
          ? fetch('/api/portal/crm/notifications/mark-all-read', { method: 'POST' }).catch(() => null)
          : null,
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

          {desktop.supported && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden="true" className="material-icons text-[14px] leading-none">
                  desktop_windows
                </span>
                Desktop notifications
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={desktop.enabled}
                onClick={toggleDesktop}
                disabled={desktop.blocked && !desktop.enabled}
                title={
                  desktop.blocked && !desktop.enabled
                    ? 'Notifications are blocked for this site in your browser settings.'
                    : 'Mentions and assignments will pop up on your desktop.'
                }
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  desktop.enabled
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {desktop.blocked && !desktop.enabled ? 'Blocked' : desktop.enabled ? 'On' : 'Off'}
              </button>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {!listLoaded ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
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
