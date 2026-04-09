import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClients } from '@/lib/portal-client';

/**
 * Returns the subdomain for the current user's default or active client.
 * Also returns all available portals when the user belongs to multiple clients.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ subdomain: null, portals: [], needsChoice: false });
  }

  const userId = parseInt(session.user.id, 10);

  // Get user's default client preference
  const [user] = await db
    .select({ defaultClientId: users.defaultClientId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const allClients = await getPortalClients(userId);
  if (allClients.length === 0) {
    return NextResponse.json({ subdomain: null, portals: [], needsChoice: false });
  }

  // Build portals list with subdomains
  const portals = await Promise.all(
    allClients.map(async (client) => {
      const [site] = await db
        .select({ subdomain: clientWebsites.subdomain })
        .from(clientWebsites)
        .where(eq(clientWebsites.clientId, client.id))
        .limit(1);
      return {
        clientId: client.id,
        company: client.company || 'Unnamed',
        subdomain: site?.subdomain || null,
      };
    }),
  );

  // If user has a default, use it
  if (user?.defaultClientId) {
    const defaultPortal = portals.find(p => p.clientId === user.defaultClientId);
    if (defaultPortal) {
      return NextResponse.json({
        subdomain: defaultPortal.subdomain,
        portals,
        needsChoice: false,
        defaultClientId: user.defaultClientId,
      });
    }
  }

  // Single client — no choice needed
  if (portals.length === 1) {
    return NextResponse.json({
      subdomain: portals[0].subdomain,
      portals,
      needsChoice: false,
    });
  }

  // Multiple clients, no default set — prompt to choose
  return NextResponse.json({
    subdomain: null,
    portals,
    needsChoice: true,
  });
}
