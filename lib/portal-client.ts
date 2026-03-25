import { db } from '@/lib/db';
import { clients, clientMembers, clientWebsites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Resolves the client account for a given user ID.
 * Checks clientMembers first (supports team access), then falls back to
 * the direct clients.userId relationship for backwards compatibility.
 */
export async function getPortalClient(userId: number) {
  const [row] = await db
    .select({ client: clients })
    .from(clientMembers)
    .innerJoin(clients, eq(clients.id, clientMembers.clientId))
    .where(eq(clientMembers.userId, userId))
    .limit(1);
  if (row) return row.client;

  // Fallback for clients created before team support was added
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  return client ?? null;
}

/**
 * Resolves and authorises a client website for a given user + siteId.
 * Returns the site row if the user's client account owns it, otherwise null.
 */
export async function resolveClientSite(userId: number, siteId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  return site ?? null;
}
