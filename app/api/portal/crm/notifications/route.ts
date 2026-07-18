import { NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmNotifications } from '@/lib/db/schema';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';

// Per-user notification snapshot cache (recent rows + unread count) used by
// the layout-shell bell on every page nav. 15s TTL — short because users
// expect new notifications to surface promptly, long enough to absorb the
// per-nav fan-out. Mark-read mutations below + any code path that inserts a
// row into `crmNotifications` should call
// `revalidateTag('notifications:'+userId)` to flush immediately.
//
// We key on (clientId, userId, limit, unreadOnly) so the bell-bar's canonical
// `?limit=20` query doesn't collide with a dropdown asking for `?limit=50`.
async function _getNotificationsSnapshotUncached(
  clientId: number,
  userId: number,
  limit: number,
  unreadOnly: boolean,
) {
  const baseScope = unreadOnly
    ? and(
        eq(crmNotifications.clientId, clientId),
        eq(crmNotifications.userId, userId),
        eq(crmNotifications.read, false),
      )
    : and(eq(crmNotifications.clientId, clientId), eq(crmNotifications.userId, userId));

  const [notifications, countRows] = await Promise.all([
    db.select()
      .from(crmNotifications)
      .where(baseScope)
      .orderBy(desc(crmNotifications.createdAt))
      .limit(limit),
    db.select({ count: sql<number>`count(*)::int` })
      .from(crmNotifications)
      .where(and(
        eq(crmNotifications.clientId, clientId),
        eq(crmNotifications.userId, userId),
        eq(crmNotifications.read, false),
      )),
  ]);

  return {
    notifications,
    unreadCount: countRows[0]?.count ?? 0,
  };
}

async function getNotificationsSnapshotCached(
  clientId: number,
  userId: number,
  limit: number,
  unreadOnly: boolean,
) {
  try {
    return await unstable_cache(
      () => _getNotificationsSnapshotUncached(clientId, userId, limit, unreadOnly),
      [
        'portal-notifications-snapshot',
        String(clientId),
        String(userId),
        String(limit),
        unreadOnly ? '1' : '0',
      ],
      { revalidate: 15, tags: ['notifications', `notifications:${userId}`] },
    )();
  } catch {
    // Outside a request context (tests/cron/MCP) — incrementalCache unavailable.
    return _getNotificationsSnapshotUncached(clientId, userId, limit, unreadOnly);
  }
}

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

export async function GET(req: Request) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limitParam = searchParams.get('limit');
  let limit = 50;
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 100);
    }
  }

  const { notifications, unreadCount } = await getNotificationsSnapshotCached(
    client.id,
    userId,
    limit,
    unreadOnly,
  );

  return NextResponse.json({
    success: true,
    data: notifications,
    unreadCount,
  });
}

// PUT preserved for back-compat with the older bell client that posted
// { ids: number[] } or { all: true }. New callers should prefer
// PATCH /[id] for single-mark-read and POST /mark-all-read for bulk.
export async function PUT(req: Request) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const body = await req.json();

  if (body.all === true) {
    await db
      .update(crmNotifications)
      .set({ read: true })
      .where(
        and(
          eq(crmNotifications.clientId, client.id),
          eq(crmNotifications.userId, userId),
          eq(crmNotifications.read, false)
        )
      );
    try { revalidateTag(`notifications:${userId}`, 'max'); } catch { /* ignore */ }
    return NextResponse.json({ success: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await db
      .update(crmNotifications)
      .set({ read: true })
      .where(
        and(
          eq(crmNotifications.clientId, client.id),
          eq(crmNotifications.userId, userId),
          inArray(crmNotifications.id, body.ids)
        )
      );
    try { revalidateTag(`notifications:${userId}`, 'max'); } catch { /* ignore */ }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, message: 'Provide { ids: number[] } or { all: true }' }, { status: 400 });
}
