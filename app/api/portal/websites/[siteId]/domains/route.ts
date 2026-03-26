import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, websiteDomains } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { addDomain } from '@/lib/vercel';

async function getSiteForClient(userId: number, siteId: string) {
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  return site || null;
}

/** GET - List all domains for a website */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await getSiteForClient(parseInt(session.user.id, 10), siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const domains = await db
    .select()
    .from(websiteDomains)
    .where(eq(websiteDomains.websiteId, site.id))
    .orderBy(websiteDomains.createdAt);

  return NextResponse.json({ success: true, data: domains });
}

/** POST - Add a new custom domain */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await getSiteForClient(parseInt(session.user.id, 10), siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  if (!site.vercelProjectId) {
    return NextResponse.json({ success: false, message: 'Website must be provisioned before adding a custom domain.' }, { status: 400 });
  }

  const body = await req.json();
  const { domain: rawDomain } = body;

  if (!rawDomain || typeof rawDomain !== 'string') {
    return NextResponse.json({ success: false, message: 'domain is required.' }, { status: 400 });
  }

  const cleanDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();

  // Check for duplicate
  const [existing] = await db
    .select()
    .from(websiteDomains)
    .where(and(eq(websiteDomains.websiteId, site.id), eq(websiteDomains.domain, cleanDomain)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'This domain is already added.' }, { status: 409 });
  }

  try {
    // Add to Vercel
    await addDomain(site.vercelProjectId, cleanDomain);

    // Check if this is the first domain (make it primary)
    const existingDomains = await db
      .select()
      .from(websiteDomains)
      .where(eq(websiteDomains.websiteId, site.id))
      .limit(1);

    const isPrimary = existingDomains.length === 0;

    // Insert into our table
    const [newDomain] = await db
      .insert(websiteDomains)
      .values({
        websiteId: site.id,
        domain: cleanDomain,
        isPrimary,
        status: 'pending',
      })
      .returning();

    // Also update the legacy domain column if this is primary
    if (isPrimary) {
      await db.update(clientWebsites)
        .set({ domain: cleanDomain, updatedAt: new Date() })
        .where(eq(clientWebsites.id, site.id));
    }

    return NextResponse.json({
      success: true,
      data: {
        ...newDomain,
        dnsInstructions: [
          { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com', notes: 'Points www subdomain to Vercel' },
          { type: 'A', host: '@', value: '76.76.21.21', notes: 'Points root domain to Vercel' },
        ],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add domain';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
