import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, brandingProfiles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { siteId } = await params;
  const websiteId = parseInt(siteId);

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const { brandingProfileId } = await req.json();

  // If a profile id is supplied, it must belong to the same client.
  if (brandingProfileId != null) {
    const [profile] = await db
      .select({ id: brandingProfiles.id })
      .from(brandingProfiles)
      .where(and(eq(brandingProfiles.id, brandingProfileId), eq(brandingProfiles.clientId, client.id)))
      .limit(1);
    if (!profile) {
      return NextResponse.json({ success: false, message: 'Branding profile not found' }, { status: 404 });
    }
  }

  const [updated] = await db
    .update(clientWebsites)
    .set({
      brandingProfileId: brandingProfileId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(clientWebsites.id, websiteId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
