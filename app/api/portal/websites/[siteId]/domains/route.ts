import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, websiteDomains } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { addDomain, getDomainConfig, resolveDomainProjectId } from '@/lib/vercel';

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

  // Shared-hosted sites (no dedicated Vercel project) attach domains to the
  // main platform project — resolveDomainProjectId handles both cases.
  let projectId: string;
  try {
    projectId = resolveDomainProjectId(site.vercelProjectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Platform Vercel project is not configured.';
    return NextResponse.json({ success: false, message }, { status: 500 });
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
    // Add to Vercel (platform project for shared-hosted sites, dedicated project otherwise)
    await addDomain(projectId, cleanDomain);

    // Ask Vercel for the project-specific CNAME target so DNS instructions
    // point to the right place (especially for shared hosting).
    let cnameTarget = 'cname.vercel-dns.com';
    try {
      const config = await getDomainConfig(cleanDomain);
      if (config.cnames[0]) cnameTarget = config.cnames[0];
    } catch {
      // Fall back to the generic target — Vercel accepts it.
    }

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

    // Generate DNS instructions. Subdomains (e.g. shop.acme.com) use a single
    // CNAME; apex domains (acme.com) need an A record to Vercel's anycast IP.
    const labelCount = cleanDomain.split('.').length;
    const isApex = labelCount <= 2;
    const dnsInstructions = isApex
      ? [
          { type: 'A', host: '@', value: '76.76.21.21', notes: `Points ${cleanDomain} to Vercel` },
          { type: 'CNAME', host: 'www', value: cnameTarget, notes: `Points www.${cleanDomain} to Vercel` },
        ]
      : [
          { type: 'CNAME', host: cleanDomain.split('.')[0], value: cnameTarget, notes: `Points ${cleanDomain} to Vercel` },
        ];

    return NextResponse.json({
      success: true,
      data: {
        ...newDomain,
        dnsInstructions,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add domain';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
