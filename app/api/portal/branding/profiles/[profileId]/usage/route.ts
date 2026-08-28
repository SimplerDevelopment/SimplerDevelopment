import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { brandingProfiles, clientWebsites, surveys } from '@/lib/db/schema';
import { and, count, eq } from 'drizzle-orm';

/**
 * PUX-189 (design doc screen 48): "Applied to" for one brand profile — the
 * sites whose brandingProfileId is this profile, plus the count of surveys
 * that carry it. Everything scoped to the caller's client: the profile must
 * be theirs (404 otherwise) and both reads filter on client_id as well as
 * the profile id, so a foreign profile id can never enumerate another
 * tenant's sites.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { profileId } = await params;
  const id = parseInt(profileId, 10);
  const [profile] = await db.select({ id: brandingProfiles.id }).from(brandingProfiles)
    .where(and(eq(brandingProfiles.id, id), eq(brandingProfiles.clientId, client.id))).limit(1);
  if (!profile) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const sites = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, client.id), eq(clientWebsites.brandingProfileId, id)));
  const [surveyRow] = await db.select({ n: count() }).from(surveys)
    .where(and(eq(surveys.clientId, client.id), eq(surveys.brandingProfileId, id)));

  return NextResponse.json({ success: true, data: { sites, surveys: Number(surveyRow?.n ?? 0) } });
}
