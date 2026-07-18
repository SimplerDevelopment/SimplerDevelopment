import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolvePortalSite } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { websiteDomains } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyDomain, resolveDomainProjectId } from '@/lib/vercel';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; domainId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, domainId } = await params;
  const userId = parseInt(session.user.id, 10);
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });
  const { site } = resolved;

  const [domainRecord] = await db
    .select()
    .from(websiteDomains)
    .where(and(eq(websiteDomains.id, parseInt(domainId)), eq(websiteDomains.websiteId, site.id)))
    .limit(1);

  if (!domainRecord) return NextResponse.json({ success: false, message: 'Domain not found' }, { status: 404 });

  try {
    const projectId = resolveDomainProjectId(site.vercelProjectId);
    const result = await verifyDomain(projectId, domainRecord.domain);

    // Update domain status if verified
    if (result.verified && !result.misconfigured) {
      await db.update(websiteDomains).set({
        status: 'verified',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(websiteDomains.id, domainRecord.id));
    }

    return NextResponse.json({
      success: true,
      data: {
        domain: domainRecord.domain,
        verified: result.verified,
        misconfigured: result.misconfigured,
        dnsRecords: result.dnsRecords,
        status: result.verified && !result.misconfigured ? 'verified' : 'pending',
      },
      message: result.verified && !result.misconfigured
        ? 'Domain verified and DNS is correctly configured.'
        : result.verified
          ? 'Domain ownership verified but DNS is still misconfigured.'
          : 'Domain not yet verified. Make sure your DNS records are set correctly.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
