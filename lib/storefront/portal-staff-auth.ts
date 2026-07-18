// Storefront design APIs (`/api/storefront/[siteId]/designs/...`) normally
// authorize via either (a) the customer's bearer session token or (b) the
// guest-cart sessionId on the design row. Neither path works for portal
// staff editing a store-mode design — those designs are publisher-authored
// with NULL sessionId/customerId.
//
// This helper provides a third path: when a request carries the
// `x-portal-staff: 1` header AND a valid NextAuth (portal) session AND the
// logged-in user has access (direct owner or clientMembers) to the requesting
// website, allow the operation. Used by:
//   - /api/storefront/[siteId]/designs/[designId]              (GET/PUT/DELETE)
//   - /api/storefront/[siteId]/designs                          (POST — create)
//   - /api/storefront/[siteId]/designs/[designId]/assets        (POST — upload)
//   - /api/storefront/[siteId]/designs/[designId]/ai-image      (POST — AI gen)
//
// The custom header is a CSRF mitigation (cross-origin requests can't set
// custom headers without a preflight); the auth() session check is the real
// gate. Both must pass.

import { db } from '@/lib/db';
import { clients, clientMembers, clientWebsites } from '@/lib/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';

/**
 * Shared query: does `userId` have access to `websiteId` (direct client
 * owner or a clientMembers row)? Used by both the header-gated request path
 * (getPortalStaffUserId, below) and the session-only server-component path
 * (portalSessionHasSiteAccess).
 */
async function userHasSiteAccess(userId: number, websiteId: number): Promise<boolean> {
  const [hit] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .innerJoin(clients, eq(clients.id, clientWebsites.clientId))
    .leftJoin(
      clientMembers,
      and(eq(clientMembers.clientId, clients.id), eq(clientMembers.userId, userId)),
    )
    .where(
      and(
        eq(clientWebsites.id, websiteId),
        or(eq(clients.userId, userId), eq(clientMembers.userId, userId)),
      ),
    )
    .limit(1);
  return !!hit;
}

/**
 * Check whether the request carries the `x-portal-staff: 1` header AND a
 * valid portal session AND the user has access to `websiteId` (direct owner
 * or clientMembers row). Returns the userId on success, null otherwise.
 *
 * Fast-fails on the header check so we don't take the auth() round-trip on
 * every storefront request that doesn't claim to be staff.
 */
export async function getPortalStaffUserId(
  req: Request,
  websiteId: number,
): Promise<number | null> {
  if (req.headers.get('x-portal-staff') !== '1') return null;
  const session = await auth();
  const userIdRaw = session?.user?.id;
  if (!userIdRaw) return null;
  const userId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) return null;
  return (await userHasSiteAccess(userId, websiteId)) ? userId : null;
}

/** Boolean convenience wrapper. */
export async function isPortalStaffWithSiteAccess(req: Request, websiteId: number): Promise<boolean> {
  return (await getPortalStaffUserId(req, websiteId)) !== null;
}

/**
 * Server-component variant of the same access check — no `x-portal-staff`
 * header requirement (there's no Request object in a server component),
 * just the portal session. Used by the new-designer page
 * (app/sites/[domain]/design/[productSlug]/page.tsx) to gate `?staff=1`
 * before rendering the editor in staff mode.
 */
export async function portalSessionHasSiteAccess(websiteId: number): Promise<boolean> {
  const session = await auth();
  const userIdRaw = session?.user?.id;
  if (!userIdRaw) return false;
  const userId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) return false;
  return userHasSiteAccess(userId, websiteId);
}
