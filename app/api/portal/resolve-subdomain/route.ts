import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClients } from '@/lib/portal-client';
import { COOKIE_NAME } from '@/lib/active-client';

/**
 * Resolves a subdomain slug to a client ID and auto-switches the active client.
 * Called by the portal layout when loaded from a subdomain (e.g. acme.simplerdevelopment.com/portal).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const subdomain = searchParams.get('subdomain');
  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain parameter required' }, { status: 400 });
  }

  // Find the website with this subdomain
  const [site] = await db
    .select({ clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(eq(clientWebsites.subdomain, subdomain))
    .limit(1);

  if (!site) {
    return NextResponse.json({ error: 'Subdomain not found' }, { status: 404 });
  }

  // Verify the user has access to this client
  const userId = parseInt(session.user.id, 10);
  const allClients = await getPortalClients(userId);
  const target = allClients.find(c => c.id === site.clientId);

  if (!target) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Set the active client cookie
  const response = NextResponse.json({
    success: true,
    clientId: target.id,
    company: target.company,
  });

  response.cookies.set(COOKIE_NAME, String(target.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
