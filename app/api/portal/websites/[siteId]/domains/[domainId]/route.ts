import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, websiteDomains } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { removeDomain } from '@/lib/vercel';

/** DELETE - Remove a custom domain */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; domainId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, domainId } = await params;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const [domainRecord] = await db
    .select()
    .from(websiteDomains)
    .where(and(eq(websiteDomains.id, parseInt(domainId)), eq(websiteDomains.websiteId, site.id)))
    .limit(1);

  if (!domainRecord) return NextResponse.json({ success: false, message: 'Domain not found' }, { status: 404 });

  try {
    // Remove from Vercel
    if (site.vercelProjectId) {
      await removeDomain(site.vercelProjectId, domainRecord.domain);
    }

    // Delete from our table
    await db.delete(websiteDomains).where(eq(websiteDomains.id, domainRecord.id));

    // If this was the primary domain, promote the next one or clear the legacy column
    if (domainRecord.isPrimary) {
      const [next] = await db
        .select()
        .from(websiteDomains)
        .where(eq(websiteDomains.websiteId, site.id))
        .orderBy(websiteDomains.createdAt)
        .limit(1);

      if (next) {
        await db.update(websiteDomains).set({ isPrimary: true }).where(eq(websiteDomains.id, next.id));
        await db.update(clientWebsites).set({ domain: next.domain, updatedAt: new Date() }).where(eq(clientWebsites.id, site.id));
      } else {
        await db.update(clientWebsites).set({ domain: null, updatedAt: new Date() }).where(eq(clientWebsites.id, site.id));
      }
    }

    return NextResponse.json({ success: true, message: 'Domain removed.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove domain';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** PATCH - Update domain (e.g., set as primary) */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ siteId: string; domainId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, domainId } = await params;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const [domainRecord] = await db
    .select()
    .from(websiteDomains)
    .where(and(eq(websiteDomains.id, parseInt(domainId)), eq(websiteDomains.websiteId, site.id)))
    .limit(1);

  if (!domainRecord) return NextResponse.json({ success: false, message: 'Domain not found' }, { status: 404 });

  const body = await req.json();

  if (body.isPrimary) {
    // Unset all other primaries first
    await db.update(websiteDomains)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(websiteDomains.websiteId, site.id));

    await db.update(websiteDomains)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(websiteDomains.id, domainRecord.id));

    // Update legacy column
    await db.update(clientWebsites)
      .set({ domain: domainRecord.domain, updatedAt: new Date() })
      .where(eq(clientWebsites.id, site.id));
  }

  return NextResponse.json({ success: true, message: 'Domain updated.' });
}
