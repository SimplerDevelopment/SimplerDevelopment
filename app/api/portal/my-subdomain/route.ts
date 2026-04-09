import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

/**
 * Returns the subdomain for the current user's active client (if any).
 * Used after login to redirect to the correct subdomain portal.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ subdomain: null });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ subdomain: null });
  }

  // Find a website with a subdomain for this client
  const [site] = await db
    .select({ subdomain: clientWebsites.subdomain })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id))
    .limit(1);

  return NextResponse.json({ subdomain: site?.subdomain || null });
}
