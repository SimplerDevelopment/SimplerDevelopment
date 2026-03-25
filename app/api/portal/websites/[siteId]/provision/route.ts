import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { provisionWebsite } from '@/lib/website-provisioner';
import { generateUniqueSubdomain } from '@/lib/subdomain';

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

  if (site.deploymentStatus === 'provisioning') {
    return NextResponse.json({ success: false, message: 'Provisioning is already in progress.' }, { status: 409 });
  }

  if (site.deploymentStatus === 'active') {
    return NextResponse.json({ success: false, message: 'Website is already provisioned.' }, { status: 409 });
  }

  // Auto-generate subdomain if missing (for websites created before this feature)
  let subdomain = site.subdomain;
  if (!subdomain) {
    subdomain = await generateUniqueSubdomain(client.company || 'site', site.name);
    await db.update(clientWebsites)
      .set({ subdomain, updatedAt: new Date() })
      .where(eq(clientWebsites.id, site.id));
  }

  // Fire and forget — provisioning updates DB status as it progresses
  provisionWebsite(site.id, subdomain, site.description || site.name).catch(() => {
    // Error already persisted to DB by provisionWebsite
  });

  return NextResponse.json({
    success: true,
    data: { siteId: site.id, subdomain, status: 'provisioning' },
  });
}
