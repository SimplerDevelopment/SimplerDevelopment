// Lightweight poll target for the notification bell.
//
// The bell mounts in the portal topbar on EVERY page, so its poll is the most
// frequently-hit route in the portal. It used to fire two requests every 45s —
// `/api/portal/notifications` and `/api/portal/crm/notifications` — each
// returning 20 fully-hydrated rows, purely to render a number badge. This
// returns the two unread counts plus only the handful of newest PM rows the
// client needs to raise a desktop notification; the full list is fetched once,
// when the dropdown actually opens.
//
// Scoping mirrors the two feeds it replaces: the PM `notifications` table is
// per-user, so `userId` alone is the tenant boundary. CRM notifications are
// (clientId, userId) and only exist for sessions that resolve a portal client —
// staff (admin/employee) simply get `crmUnread: 0` rather than a 404.

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

  // limit 1 — we only want `unreadCount` here, but going through the shared
  // snapshot keeps this on the same 15s cache + `notifications:<userId>`
  // invalidation tag as the dropdown's own fetch.
  const crmUnread = client
    ? (await getCrmNotificationsSnapshot(client.id, userId, 1, false)).unreadCount
    : 0;

  return NextResponse.json({
    success: true,
    data: {
      pmUnread: pmCount[0]?.unread ?? 0,
      crmUnread,
      latest: latest.map((r) => ({
        ...r,
        body: r.body ? r.body.slice(0, BODY_PREVIEW_CHARS) : null,
      })),
    },
  });
}
