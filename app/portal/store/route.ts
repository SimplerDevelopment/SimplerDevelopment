import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

/**
 * PUX-123 resolver route.
 *
 * The onboarding "get started" checklist (lib/onboarding/module-segments.ts)
 * wants to send Store steps at a site-scoped surface
 * (/portal/websites/[siteId]/store) instead of the generic websites list —
 * but that table is a static, DB-free module with no `siteId` in scope to
 * interpolate (see the comment on the `store` entry there). Rather than
 * plumbing site context into a table that is deliberately static/cheap, this
 * route resolves the caller's site server-side and 307-redirects into the
 * real store surface. /portal/store/products (sibling route) does the same
 * for the "Add your first product" step.
 *
 * Tenancy: the active CLIENT comes from getPortalClient(userId), the same
 * cookie-backed + membership-validated resolver app/portal/websites/page.tsx
 * uses — never trust a clientId/siteId from the request. The site query below
 * is scoped to that client's own clientWebsites rows only, so a caller can
 * never be redirected into another client's siteId.
 *
 * Site selection (no dedicated "active site" concept exists in this repo —
 * only lib/active-client.ts's active CLIENT; a client can own several
 * websites): take the first site by creation order, the same ordering
 * app/portal/websites/page.tsx uses to list them. A disambiguation UI for the
 * multi-site case is out of scope per the PUX-123 card — if this resolver
 * ever needs one, this is the seam to add it at.
 *
 * Zero sites: fall back to /portal/websites — today's behavior, and the
 * actual place a site-less user needs to go (to create one) before any store
 * surface can exist for them.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/portal/login', request.url));
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url));
  }

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id))
    .orderBy(clientWebsites.createdAt)
    .limit(1);

  if (!site) {
    return NextResponse.redirect(new URL('/portal/websites', request.url));
  }

  return NextResponse.redirect(new URL(`/portal/websites/${site.id}/store`, request.url));
}
