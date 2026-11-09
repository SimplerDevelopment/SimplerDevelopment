'use client';

// The bell's list under the redesign (PUX-148, design doc screen 04): grouped
// Today / Earlier, the ACTOR leads each row ("Dana Park replied on #482"),
// every row is a link, and a footer connects the feed to the preferences that
// shape it. State, polling and mark-read stay in NotificationBell — this only
// renders what it is handed.
import Link from 'next/link';
import type { UnifiedNotif } from './NotificationBell';
import { sBtnGhost } from './portal-ui';
import { dayBucket, initials, relativeTime, splitActor } from '@/lib/notifications/feed';

export default function StudioNotificationList({
  notifications, loaded, loading, filterUnread, unreadCount, onItemClick, onMarkAllRead,
}: {
  notifications: UnifiedNotif[];
  loaded: boolean;
  loading: boolean;
  filterUnread: boolean;
  unreadCount: number;
  onItemClick: (n: UnifiedNotif) => void;
  onMarkAllRead: () => void;
}) {
  const buckets: Array<['Today' | 'Earlier', UnifiedNotif[]]> = [['Today', []], ['Earlier', []]];
  for (const n of notifications) buckets[dayBucket(n.createdAt) === 'Today' ? 0 : 1][1].push(n);

  return (
    <>
      <div className="max-h-96 overflow-y-auto">
        {!loaded ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {filterUnread ? 'No unread notifications' : 'Nothing yet — replies, mentions and approvals land here.'}
          </div>
        ) : buckets.filter(([, rows]) => rows.length > 0).map(([label, rows]) => (
          <div key={label}>
            <div className="px-3.5 pb-0.5 pt-2.5 font-mono text-[11px] uppercase tracking-[.06em] text-muted-foreground">{label}</div>
            {rows.map((n) => {
              const { actor, rest } = splitActor(n.title, n.actor);
              return (
                <div
                  key={`${n.source}-${n.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onItemClick(n)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemClick(n); } }}
                  className="flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                    {actor ? initials(actor) : <span className="material-icons text-[14px]">{n.icon}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-foreground">
                      {actor && <b className="font-semibold">{actor}</b>}{actor ? ' ' : ''}{rest}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{n.body ?? n.group} · {relativeTime(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2.5 border-t border-border bg-background px-3.5 py-2.5">
        <button type="button" onClick={onMarkAllRead} disabled={loading || unreadCount === 0} className={`${sBtnGhost} px-2.5 py-1 text-xs disabled:opacity-50`}>
          Mark all read
        </button>
        <span className="flex-1" />
        <Link href="/portal/settings/notifications" className="text-xs text-muted-foreground underline hover:text-foreground">
          What reaches you
        </Link>
      </div>
    </>
  );
}
