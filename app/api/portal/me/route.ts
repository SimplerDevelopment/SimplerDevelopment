/**
 * GET /api/portal/me
 *
 * Returns the authenticated user + active client. Accepts EITHER:
 *   - a NextAuth session cookie (regular portal call), OR
 *   - an `Authorization: Bearer <sd_mcp_... | sd_oauth_...>` header
 *     (mobile / external API client; validated via `resolvePortalFromRequest`).
 *
 * This is the canonical "who am I" probe — mobile uses it to hydrate user state
 * on launch and to verify a stored bearer token is still valid.
 *
 * Response: { success: true, data: { user: { id, email, name, role }, client: { id, company, subdomain } | null } }
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, users } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { resolvePortalFromRequest } from '@/lib/mcp-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MePayload {
  user: { id: number; email: string; name: string; role: string };
  client: { id: number; company: string; subdomain: string | null } | null;
}

// `clients.subdomain` doesn't exist — subdomain lives on `client_websites`.
// Resolve the client's default website's subdomain (matching the helper in
// /api/portal/my-subdomain), with a fallback to the first website that has one.
async function resolveClientSubdomain(
  clientId: number,
  defaultWebsiteId: number | null,
): Promise<string | null> {
  if (defaultWebsiteId) {
    const [site] = await db
      .select({ subdomain: clientWebsites.subdomain })
      .from(clientWebsites)
      .where(
        and(eq(clientWebsites.id, defaultWebsiteId), eq(clientWebsites.clientId, clientId)),
      )
      .limit(1);
    if (site?.subdomain) return site.subdomain;
  }
  const [site] = await db
    .select({ subdomain: clientWebsites.subdomain })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, clientId))
    .limit(1);
  return site?.subdomain ?? null;
}

export async function GET(req: Request) {
  // 1. Bearer token path (mobile / API clients).
  const bearerCtx = await resolvePortalFromRequest(req);
  if (bearerCtx) {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, bearerCtx.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const subdomain = await resolveClientSubdomain(
      bearerCtx.client.id,
      bearerCtx.client.defaultWebsiteId ?? null,
    );
    const payload: MePayload = {
      user,
      client: {
        id: bearerCtx.client.id,
        company: bearerCtx.client.company ?? '',
        subdomain,
      },
    };
    return NextResponse.json({ success: true, data: payload });
  }

  // 2. NextAuth session-cookie path (portal pages).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }

  const client = await getPortalClient(userId);
  const subdomain = client
    ? await resolveClientSubdomain(client.id, client.defaultWebsiteId ?? null)
    : null;
  const payload: MePayload = {
    user,
    client: client
      ? { id: client.id, company: client.company ?? '', subdomain }
      : null,
  };
  return NextResponse.json({ success: true, data: payload });
}
