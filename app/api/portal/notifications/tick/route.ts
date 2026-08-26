// Lightweight poll target for the notification bell.
//
// The bell mounts in the portal topbar on EVERY page, so its poll is the most
// frequently-hit route in the portal. It used to fire two requests every 45s —
// `/api/portal/notifications` and `/api/portal/crm/notifications` — each
// returning 20 fully-hydrated rows, purely to render a number badge. This
// returns the two unread counts plus only the handful of newest PM and CRM
// rows the client needs to raise a desktop notification; the full list is
// fetched once, when the dropdown actually opens.
//
// Scoping mirrors the two feeds it replaces: the PM `notifications` table is
// per-user, so `userId` alone is the tenant boundary. CRM notifications are
// (clientId, userId) and only exist for sessions that resolve a portal client —
// staff (admin/employee) simply get `crmUnread: 0` / `latestCrm: []` rather
// than a 404.
//
// PUX-102: `latestCrm` is returned here purely on whether `getPortalClient`
// resolves a client — same condition `crmUnread` already used, which includes
// a staff session impersonating a client. The stricter "can this session
// actually see the CRM dropdown" gate (`role === 'client'`) is enforced
// client-side in NotificationBell, same as it already is for `crmUnread`
// (see the comment on `canFetchCrm` there). Keeping that gate in one place
// avoids the route and the component disagreeing about who staff-impersonation
// covers.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { getCrmNotificationsSnapshot } from '@/lib/crm/notifications';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

// Enough headroom that a burst of non-toastable events (an agent shuffling
// cards through lanes) can't push a genuine mention out of the window before
// the client sees it. Still ~1/8th the payload of the old dual full-list poll.
const LATEST_LIMIT = 5;

// The toast shows a title and a one-line preview; a 500-char comment snippet
// would be truncated by the OS anyway. Trim on the server so it never crosses
// the wire.
const BODY_PREVIEW_CHARS = 140;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);

  const [latest, pmCount, client] = await Promise.all([
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        title: notifications.title,
        body: notifications.body,
        cardId: notifications.cardId,
        projectId: notifications.projectId,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.id))
      .limit(LATEST_LIMIT),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    getPortalClient(userId),
  ]);

  // limit LATEST_LIMIT — same headroom reasoning as the PM `latest` query
  // above, and going through the shared snapshot keeps this on the same 15s
  // cache + `notifications:<userId>` invalidation tag as the dropdown's own
  // fetch (the cache key includes `limit`, so this hits its own entry rather
  // than the dropdown's `limit=20` one or this route's old `limit=1`).
  const crmSnapshot = client
    ? await getCrmNotificationsSnapshot(client.id, userId, LATEST_LIMIT, false)
    : null;

  return NextResponse.json({
    success: true,
    data: {
      pmUnread: pmCount[0]?.unread ?? 0,
      crmUnread: crmSnapshot?.unreadCount ?? 0,
      latest: latest.map((r) => ({
        ...r,
        body: r.body ? r.body.slice(0, BODY_PREVIEW_CHARS) : null,
      })),
      latestCrm: (crmSnapshot?.notifications ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body ? r.body.slice(0, BODY_PREVIEW_CHARS) : null,
        entityType: r.entityType,
        entityId: r.entityId,
        createdAt: r.createdAt,
      })),
    },
  });
}
