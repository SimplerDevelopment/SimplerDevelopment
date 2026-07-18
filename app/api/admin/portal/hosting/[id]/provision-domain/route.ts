import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hostedSites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { DnsInstruction } from '@/lib/db/schema';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * POST /api/admin/portal/hosting/[id]/provision-domain
 *
 * Sets the custom domain on the hosted site and generates DNS instructions.
 * The admin should then use the Railway dashboard or MCP tools to add the
 * custom domain to the Railway service. This endpoint stores the mapping
 * so the middleware can route traffic.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { customDomain } = body;

  if (!customDomain) {
    return NextResponse.json({ success: false, message: 'customDomain is required' }, { status: 400 });
  }

  // Fetch the existing site
  const [site] = await db.select().from(hostedSites).where(eq(hostedSites.id, parseInt(id))).limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Generate DNS instructions based on Railway domain
  const dnsInstructions: DnsInstruction[] = [];

  if (site.railwayDomain) {
    // CNAME for subdomain or www
    dnsInstructions.push({
      type: 'CNAME',
      host: customDomain.startsWith('www.') ? 'www' : '@',
      value: site.railwayDomain,
      ttl: '3600',
      notes: `Point your domain to Railway. If using a root domain, some DNS providers require an ALIAS or ANAME record instead of CNAME.`,
    });
  } else {
    // No Railway domain yet — provide generic instructions
    dnsInstructions.push({
      type: 'CNAME',
      host: customDomain.startsWith('www.') ? 'www' : '@',
      value: '<pending — Railway domain not yet assigned>',
      ttl: '3600',
      notes: 'A Railway domain must be generated first. Use the Railway dashboard to add this custom domain to the service.',
    });
  }

  // Update the hosted site
  const [updated] = await db
    .update(hostedSites)
    .set({
      customDomain,
      dnsInstructions,
      status: 'provisioning',
      updatedAt: new Date(),
    })
    .where(eq(hostedSites.id, parseInt(id)))
    .returning();

  // Also update the client_websites domain if there's a linked CMS website
  // (the middleware resolves against client_websites.domain)

  return NextResponse.json({
    success: true,
    data: updated,
    message: dnsInstructions.some(d => d.value.includes('<pending'))
      ? 'Domain saved but Railway domain not yet assigned. Generate a Railway domain first, then re-provision.'
      : 'Domain provisioned. Client should configure DNS records as shown in dnsInstructions.',
  });
}
