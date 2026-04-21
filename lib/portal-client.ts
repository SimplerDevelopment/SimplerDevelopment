import { db } from '@/lib/db';
import { clients, clientMembers, clientWebsites, clientServices, services } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';

const ACTIVE_CLIENT_COOKIE = 'sd-active-client';

/**
 * Resolves the client account for a given user ID.
 * Automatically reads the sd-active-client cookie to determine the preferred company.
 * All existing call sites work without changes.
 */
export async function getPortalClient(userId: number, preferredClientId?: number) {
  const allClients = await getPortalClients(userId);
  if (allClients.length === 0) return null;

  // Read preferred client from cookie if not explicitly provided
  let preferred = preferredClientId;
  if (!preferred) {
    try {
      const store = await cookies();
      const val = store.get(ACTIVE_CLIENT_COOKIE)?.value;
      if (val) preferred = parseInt(val, 10);
    } catch {
      // cookies() may throw outside of request context (e.g. build time)
    }
  }

  // If a preferred client is set, verify access and return it
  if (preferred) {
    const match = allClients.find(c => c.id === preferred);
    if (match) return match;
  }

  // Default to first available
  return allClients[0];
}

/**
 * Returns ALL clients a user has access to (via team membership or direct ownership).
 */
export async function getPortalClients(userId: number) {
  // Get all clients via team membership
  const teamRows = await db
    .select({ client: clients, role: clientMembers.role })
    .from(clientMembers)
    .innerJoin(clients, eq(clients.id, clientMembers.clientId))
    .where(eq(clientMembers.userId, userId));

  const teamClientIds = new Set(teamRows.map(r => r.client.id));
  const result = teamRows.map(r => r.client);

  // Also check direct ownership (legacy) for clients not already found via membership
  const ownedClients = await db
    .select()
    .from(clients)
    .where(eq(clients.userId, userId));

  for (const c of ownedClients) {
    if (!teamClientIds.has(c.id)) {
      result.push(c);
    }
  }

  return result;
}

/**
 * Returns the user's role on a specific client, or null if the user has no
 * access. 'owner' is returned for legacy direct-owned rows (clients.userId)
 * even when no clientMembers record exists.
 */
export async function getPortalRole(userId: number, clientId: number): Promise<'owner' | 'admin' | 'member' | 'viewer' | null> {
  const [client] = await db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (client && client.userId === userId) return 'owner';
  const [member] = await db
    .select({ role: clientMembers.role })
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, userId)))
    .limit(1);
  if (!member) return null;
  return (member.role as 'owner' | 'admin' | 'member' | 'viewer') ?? null;
}

/**
 * Returns all clients with the user's role for each (used by the switcher API).
 */
export async function getPortalClientsWithRoles(userId: number) {
  // Team memberships with roles
  const teamRows = await db
    .select({ client: clients, role: clientMembers.role })
    .from(clientMembers)
    .innerJoin(clients, eq(clients.id, clientMembers.clientId))
    .where(eq(clientMembers.userId, userId));

  const teamClientIds = new Set(teamRows.map(r => r.client.id));
  const result = teamRows.map(r => ({ ...r.client, role: r.role as string }));

  // Direct ownership fallback
  const ownedClients = await db
    .select()
    .from(clients)
    .where(eq(clients.userId, userId));

  for (const c of ownedClients) {
    if (!teamClientIds.has(c.id)) {
      result.push({ ...c, role: 'owner' });
    }
  }

  return result;
}

/**
 * Resolves and authorises a client website for a given user + siteId.
 * Returns the site row if the user's client account owns it, otherwise null.
 */
export async function resolveClientSite(userId: number, siteId: number, preferredClientId?: number) {
  const client = await getPortalClient(userId, preferredClientId);
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
