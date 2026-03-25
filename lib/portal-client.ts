import { db } from '@/lib/db';
import { clients, clientMembers, clientWebsites, clientServices, services } from '@/lib/db/schema';
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

/**
 * Checks if a client has an active subscription for a service by category slug.
 * Returns the service row if subscribed, null otherwise.
 */
export async function checkServiceSubscription(clientId: number, category: string) {
  const [row] = await db
    .select({ service: services, subscription: clientServices })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(
      and(
        eq(clientServices.clientId, clientId),
        eq(clientServices.status, 'active'),
        eq(services.category, category),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Gets the service catalog entry for a given category.
 */
export async function getServiceByCategory(category: string) {
  const [svc] = await db
    .select()
    .from(services)
    .where(and(eq(services.category, category), eq(services.active, true)))
    .limit(1);
  return svc ?? null;
}
