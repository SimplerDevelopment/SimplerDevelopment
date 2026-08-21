import { db } from '@/lib/db';
import {
  crmNotifications,
  clientMembers,
  clients,
  notificationPreferences,
  type NotificationDelivery,
} from '@/lib/db/schema';
import { eq, and, ne, or, desc, sql } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';

/**
 * Invalidate the per-user `notifications:<userId>` cache tag used by
 * `/api/portal/crm/notifications` so a newly-inserted notification surfaces
 * on the recipient's next bell-bar poll without waiting out the 15s TTL.
 */
function invalidateNotificationsCache(userIds: number[]): void {
  for (const userId of userIds) {
    try {
      revalidateTag(`notifications:${userId}`, 'max');
    } catch {
      // Non-route context (e.g. called from a cron worker or background job).
      // The 15s TTL will catch up on the next poll.
    }
  }
}

/**
 * Per-user notification preference gate.
 *
 * Returns `{ deliver, mode }` where:
 *   - `deliver: false`           — caller must skip the insert (mode === 'off')
 *   - `deliver: true, mode: 'instant'`     — default behavior (no row, or row=instant)
 *   - `deliver: true, mode: 'digest_daily'` — still insert, but mark `metadata.digest = true`
 *
 * Absence of a preference row is treated as `instant` so the migration is
 * non-breaking — existing emitter callsites keep firing exactly as before.
 */
export async function shouldDeliverNotification(
  clientId: number,
  userId: number,
  type: string,
): Promise<{ deliver: boolean; mode: NotificationDelivery }> {
  const [pref] = await db
    .select({ delivery: notificationPreferences.delivery })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.clientId, clientId),
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.notificationType, type),
      ),
    )
    .limit(1);

  if (!pref) return { deliver: true, mode: 'instant' };
  if (pref.delivery === 'off') return { deliver: false, mode: 'off' };
  if (pref.delivery === 'digest_daily') return { deliver: true, mode: 'digest_daily' };
  return { deliver: true, mode: 'instant' };
}

export async function createCrmNotification(params: {
  clientId: number;
  userId: number;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
}) {
  const gate = await shouldDeliverNotification(params.clientId, params.userId, params.type);
  if (!gate.deliver) return null;

  const metadata = gate.mode === 'digest_daily' ? { digest: true } : null;

  const [notification] = await db
    .insert(crmNotifications)
    .values({
      clientId: params.clientId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      metadata,
    })
    .returning();
  if (notification) invalidateNotificationsCache([params.userId]);
  return notification;
}

export async function notifyAllClientUsers(params: {
  clientId: number;
  excludeUserId?: number;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
}) {
  // Find all users who are members of this client
  const membersQuery = db
    .select({ userId: clientMembers.userId })
    .from(clientMembers)
    .where(
      params.excludeUserId
        ? and(
            eq(clientMembers.clientId, params.clientId),
            ne(clientMembers.userId, params.excludeUserId)
          )
        : eq(clientMembers.clientId, params.clientId)
    );

  const members = await membersQuery;

  if (members.length === 0) return [];

  // Filter recipients by per-user preference. Sequential here is fine — the
  // recipient list is bounded by tenant size and the lookup is indexed.
  const filtered: Array<{ userId: number; mode: NotificationDelivery }> = [];
  for (const m of members) {
    const gate = await shouldDeliverNotification(params.clientId, m.userId, params.type);
    if (gate.deliver) filtered.push({ userId: m.userId, mode: gate.mode });
  }

  if (filtered.length === 0) return [];

  const values = filtered.map((m) => ({
    clientId: params.clientId,
    userId: m.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    metadata: m.mode === 'digest_daily' ? { digest: true } : null,
  }));

  const notifications = await db
    .insert(crmNotifications)
    .values(values)
    .returning();

  invalidateNotificationsCache(filtered.map((m) => m.userId));
  return notifications;
}

/**
 * Notify only users with approver roles (owner/admin) on a client. Used by the
 * MCP approval workflow so pending-change alerts don't flood members who can't
 * act on them anyway.
 *
 * Legacy direct-owner (clients.userId) is included even without a clientMembers
 * row. The submitter, if provided, is excluded.
 */
export async function notifyApprovers(params: {
  clientId: number;
  excludeUserId?: number;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
}) {
  const [client] = await db
    .select({ userId: clients.userId })
    .from(clients)
    .where(eq(clients.id, params.clientId))
    .limit(1);

  const adminMembers = await db
    .select({ userId: clientMembers.userId })
    .from(clientMembers)
    .where(
      and(
        eq(clientMembers.clientId, params.clientId),
        or(eq(clientMembers.role, 'owner'), eq(clientMembers.role, 'admin'))!,
      ),
    );

  const recipientIds = new Set<number>(adminMembers.map((m) => m.userId));
  if (client) recipientIds.add(client.userId);
  if (params.excludeUserId) recipientIds.delete(params.excludeUserId);
  if (recipientIds.size === 0) return [];

  // Filter by per-user preference, same as notifyAllClientUsers.
  const filtered: Array<{ userId: number; mode: NotificationDelivery }> = [];
  for (const userId of recipientIds) {
    const gate = await shouldDeliverNotification(params.clientId, userId, params.type);
    if (gate.deliver) filtered.push({ userId, mode: gate.mode });
  }

  if (filtered.length === 0) return [];

  const values = filtered.map(({ userId, mode }) => ({
    clientId: params.clientId,
    userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    metadata: mode === 'digest_daily' ? { digest: true } : null,
  }));

  const inserted = await db.insert(crmNotifications).values(values).returning();
  invalidateNotificationsCache(filtered.map((f) => f.userId));
  return inserted;
}

/**
 * Read side of the CRM notification feed, shared by the bell's two consumers:
 * `/api/portal/crm/notifications` (the full dropdown list) and
 * `/api/portal/notifications/tick` (the badge/toast poll, which wants only
 * `unreadCount`).
 *
 * It lives here rather than in either route because a Next.js `route.ts` may
 * only export HTTP handlers and route config — exporting a helper from one
 * fails the generated route type-check, so the two routes would otherwise
 * have to duplicate the query and the cache policy.
 *
 * The 15s TTL is short because users expect new notifications promptly, long
 * enough to absorb the per-nav fan-out from a bell that mounts on every portal
 * page. `invalidateNotificationsCache` above flushes it on insert so a fresh
 * notification doesn't wait out the TTL. The cache key includes `limit`, so
 * the tick poll (limit 1) and the dropdown (limit 20) hold separate entries —
 * both carry the same `notifications:<userId>` tag and flush together.
 */
async function _crmNotificationsSnapshotUncached(
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

  const [rows, countRows] = await Promise.all([
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
    notifications: rows,
    unreadCount: countRows[0]?.count ?? 0,
  };
}

export async function getCrmNotificationsSnapshot(
  clientId: number,
  userId: number,
  limit: number,
  unreadOnly: boolean,
) {
  try {
    return await unstable_cache(
      () => _crmNotificationsSnapshotUncached(clientId, userId, limit, unreadOnly),
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
    return _crmNotificationsSnapshotUncached(clientId, userId, limit, unreadOnly);
  }
}
