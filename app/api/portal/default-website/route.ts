import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientWebsites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

/**
 * GET: returns the client's websites and current default website ID.
 * POST: sets the client's default website (determines portal subdomain).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ error: 'No client found' }, { status: 404 });
  }

  const websites = await db
    .select({
      id: clientWebsites.id,
      name: clientWebsites.name,
      subdomain: clientWebsites.subdomain,
      domain: clientWebsites.domain,
    })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id));

  return NextResponse.json({
    websites,
    defaultWebsiteId: client.defaultWebsiteId || null,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { websiteId } = await req.json();
  if (!websiteId || typeof websiteId !== 'number') {
    return NextResponse.json({ error: 'websiteId is required' }, { status: 400 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ error: 'No client found' }, { status: 404 });
  }

  // Verify the website belongs to this client
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) {
    return NextResponse.json({ error: 'Website not found' }, { status: 404 });
  }

  await db.update(clients).set({
    defaultWebsiteId: websiteId,
    updatedAt: new Date(),
  }).where(eq(clients.id, client.id));

  return NextResponse.json({ success: true, defaultWebsiteId: websiteId });
}
