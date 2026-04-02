import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, siteBranding } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const websites = await db
    .select({
      id: clientWebsites.id,
      name: clientWebsites.name,
      domain: clientWebsites.domain,
      brandingProfileId: clientWebsites.brandingProfileId,
      brandingId: siteBranding.id,
      primaryColor: siteBranding.primaryColor,
      accentColor: siteBranding.accentColor,
      logoUrl: siteBranding.logoUrl,
      headingFont: siteBranding.headingFont,
      bodyFont: siteBranding.bodyFont,
    })
    .from(clientWebsites)
    .leftJoin(siteBranding, eq(siteBranding.websiteId, clientWebsites.id))
    .where(eq(clientWebsites.clientId, client.id));

  return NextResponse.json({ success: true, data: websites });
}
