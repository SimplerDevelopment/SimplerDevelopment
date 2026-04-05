import { db } from '@/lib/db';
import { crmNotifications, clientMembers } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';

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
