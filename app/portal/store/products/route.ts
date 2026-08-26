import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

/**
 * PUX-123 resolver route — sibling of /portal/store (see the comment there
 * for the full rationale: module-segments.ts is static/DB-free, so a
 * site-scoped destination has to be resolved server-side here instead).
 * Serves the "Add your first product" checklist step, which needs
 * /portal/websites/[siteId]/store/products specifically.
 *
 * Tenancy + site-selection decisions are identical to /portal/store — see
 * that route for the reasoning (active client via getPortalClient(userId),
 * first site by creation order, fall back to /portal/websites on zero sites).
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

  return NextResponse.redirect(new URL(`/portal/websites/${site.id}/store/products`, request.url));
}
