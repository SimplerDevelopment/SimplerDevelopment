import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyDomain } from '@/lib/vercel';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { siteId } = await params;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  if (!site.domain) {
    return NextResponse.json({ success: false, message: 'No custom domain configured' }, { status: 400 });
  }

  if (!site.vercelProjectId) {
    return NextResponse.json({ success: false, message: 'Website must be provisioned first' }, { status: 400 });
  }

  try {
    const result = await verifyDomain(site.vercelProjectId, site.domain);

    return NextResponse.json({
      success: true,
      data: {
        domain: site.domain,
        verified: result.verified,
        misconfigured: result.misconfigured,
        dnsRecords: result.dnsRecords,
        status: result.verified && !result.misconfigured ? 'active' : 'pending',
      },
      message: result.verified && !result.misconfigured
        ? 'Domain verified and DNS is correctly configured.'
        : result.verified
          ? 'Domain ownership verified but DNS is still misconfigured. Check your DNS records.'
          : 'Domain not yet verified. Make sure your DNS records are set correctly.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
