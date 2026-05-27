import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { clients, clientMembers, clientWebsites, clientServices, services, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';
import {
  IMPERSONATE_COOKIE,
  getImpersonatedClientIdFromToken,
} from '@/lib/impersonation';

const ACTIVE_CLIENT_COOKIE = 'sd-active-client';

/**
 * Resolves the client account for a given user ID.
 * Automatically reads the sd-active-client cookie to determine the preferred company.
 * If a valid `sd_impersonate_client_id` cookie is present AND the user is
 * staff, that impersonation target takes priority over normal resolution.
 * All existing call sites work without changes.
 *
 * Wrapped in `React.cache` so repeated calls within a single request (e.g.
 * middleware + every server component + every server-only API route invoked
 * during the same render) dedupe to one DB query. Safe because the resolver
 * is read-only and the cache is per-request.
 */
export const getPortalClient = cache(async (userId: number, preferredClientId?: number) => {
  // Check for staff impersonation first — short-circuits the membership lookup.
  // We re-fetch the role from the DB rather than trusting any JWT/session
  // floating around, so this resolver is safe to call anywhere (server
  // components, API routes, middleware-adjacent code) without needing a
  // session handle.
  try {
    const store = await cookies();
    const tokenVal = store.get(IMPERSONATE_COOKIE)?.value;
    if (tokenVal) {
      const [me] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const targetId = getImpersonatedClientIdFromToken(tokenVal, me?.role);
      if (targetId != null) {
        const [target] = await db
          .select()
          .from(clients)
          .where(eq(clients.id, targetId))
          .limit(1);
        if (target) return target;
      }
    }
  } catch {
    // cookies() may throw outside of request context (e.g. build time)
  }

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
});

/**
 * Returns ALL clients a user has access to (via team membership or direct ownership).
 * Wrapped in `React.cache` for per-request dedupe.
 */
export const getPortalClients = cache(async (userId: number) => {
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
});

/**
 * Returns the user's role on a specific client, or null if the user has no
 * access. 'owner' is returned for legacy direct-owned rows (clients.userId)
 * even when no clientMembers record exists.
 * Wrapped in `React.cache` for per-request dedupe.
 */
export const getPortalRole = cache(async (userId: number, clientId: number): Promise<'owner' | 'admin' | 'member' | 'viewer' | null> => {
  const [client] = await db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (client && client.userId === userId) return 'owner';
  const [member] = await db
    .select({ role: clientMembers.role })
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, userId)))
    .limit(1);
  if (!member) return null;
  return (member.role as 'owner' | 'admin' | 'member' | 'viewer') ?? null;
});

/**
 * Returns all clients with the user's role for each (used by the switcher API).
 * Wrapped in `React.cache` for per-request dedupe.
 */
export const getPortalClientsWithRoles = cache(async (userId: number) => {
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
});

/**
 * Resolves and authorises a client website for a given user + siteId.
 * Returns the site row if the user's client account owns it, otherwise null.
 * Wrapped in `React.cache` for per-request dedupe.
 */
export const resolveClientSite = cache(async (userId: number, siteId: number, preferredClientId?: number) => {
  const client = await getPortalClient(userId, preferredClientId);
  if (!client) return null;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  return site ?? null;
});

/**
 * Checks if a client has an active subscription for a service by category slug.
 * Returns the service row if subscribed, null otherwise.
 * Wrapped in `React.cache` for per-request dedupe.
 */
export const checkServiceSubscription = cache(async (clientId: number, category: string) => {
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
});

/**
 * Gets the service catalog entry for a given category. Cross-request cached
 * via `unstable_cache` (5min TTL, tag `services-catalog`) — service catalog
 * is admin-curated and almost never changes between renders.
 */
const _getServiceByCategoryUncached = async (category: string) => {
  const [svc] = await db
    .select()
    .from(services)
    .where(and(eq(services.category, category), eq(services.active, true)))
    .limit(1);
  return svc ?? null;
};

export const getServiceByCategory = unstable_cache(
  _getServiceByCategoryUncached,
  ['portal-service-by-category'],
  { revalidate: 300, tags: ['services-catalog'] },
);
