import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hostedSites, clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolve } from 'dns/promises';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * POST /api/admin/portal/hosting/[id]/verify-dns
 *
 * Checks if the custom domain's DNS is correctly pointed at the Railway domain.
 * Updates hosted_sites status to 'active' if verified.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [site] = await db.select().from(hostedSites).where(eq(hostedSites.id, parseInt(id))).limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  if (!site.customDomain) {
    return NextResponse.json({ success: false, message: 'No custom domain configured' }, { status: 400 });
  }

  if (!site.railwayDomain) {
    return NextResponse.json({ success: false, message: 'No Railway domain assigned yet' }, { status: 400 });
  }

  const domain = site.customDomain;
  const expectedTarget = site.railwayDomain.replace(/\.$/, ''); // strip trailing dot

  let verified = false;
  const dnsResults: { type: string; records: string[] }[] = [];

  // Check CNAME
  try {
    const cnameRecords = await resolve(domain, 'CNAME');
    dnsResults.push({ type: 'CNAME', records: cnameRecords as string[] });
    verified = cnameRecords.some(
      (r) => typeof r === 'string' && r.replace(/\.$/, '').toLowerCase() === expectedTarget.toLowerCase()
    );
  } catch {
    // CNAME lookup failed — might be using A record or ALIAS
  }

  // If CNAME didn't match, check if A records resolve to the same IP as Railway
  if (!verified) {
    try {
      const [domainIps, railwayIps] = await Promise.all([
        resolve(domain, 'A').catch(() => [] as string[]),
        resolve(expectedTarget, 'A').catch(() => [] as string[]),
      ]);
      dnsResults.push({ type: 'A (domain)', records: domainIps as string[] });
      dnsResults.push({ type: 'A (railway)', records: railwayIps as string[] });

      if (domainIps.length > 0 && railwayIps.length > 0) {
        const domainSet = new Set(domainIps);
        verified = (railwayIps as string[]).some((ip) => domainSet.has(ip));
      }
    } catch {
      // A record lookup failed
    }
  }

  if (verified) {
    // Update status to active
    await db
      .update(hostedSites)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(hostedSites.id, parseInt(id)));

    // Also ensure the client_websites record has this domain
    // so the middleware can route to it
    const [cw] = await db
      .select()
      .from(clientWebsites)
      .where(eq(clientWebsites.clientId, site.clientId))
      .limit(1);

    if (cw && !cw.domain) {
      await db
        .update(clientWebsites)
        .set({ domain, updatedAt: new Date() })
        .where(eq(clientWebsites.id, cw.id));
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      verified,
      domain,
      expectedTarget,
      dnsResults,
      status: verified ? 'active' : 'pending',
    },
    message: verified
      ? 'DNS verified! Domain is now active.'
      : 'DNS not yet pointing to Railway. Records found are shown in dnsResults.',
  });
}
