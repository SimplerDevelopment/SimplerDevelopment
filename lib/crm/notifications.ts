import { db } from '@/lib/db';
import { crmNotifications, clientMembers, clients } from '@/lib/db/schema';
import { eq, and, ne, or } from 'drizzle-orm';

export async function createCrmNotification(params: {
  clientId: number;
  userId: number;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
}) {
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
    })
    .returning();
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

  const values = members.map((m) => ({
    clientId: params.clientId,
    userId: m.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
  }));

  const notifications = await db
    .insert(crmNotifications)
    .values(values)
    .returning();

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

  const values = Array.from(recipientIds).map((userId) => ({
    clientId: params.clientId,
    userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
  }));

  return db.insert(crmNotifications).values(values).returning();
}
