import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, googleWebsiteTokens } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { getAuthenticatedClient } from '@/lib/google-website-oauth';
import { google } from 'googleapis';

async function resolveWebsite(userId: number, siteId: string) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const websiteId = parseInt(siteId, 10);
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  return site || null;
}

/** List the user's Search Console sites */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveWebsite(parseInt(session.user.id, 10), siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const oauth2Client = await getAuthenticatedClient(site.id);
  if (!oauth2Client) return NextResponse.json({ success: false, message: 'Google not connected' }, { status: 400 });

  try {
    const webmasters = google.webmasters({ version: 'v3', auth: oauth2Client });
    const res = await webmasters.sites.list();
    const sites = (res.data.siteEntry || []).map((s) => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel,
    }));
    return NextResponse.json({ success: true, data: sites });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list Search Console sites';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Select or create a Search Console site */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveWebsite(parseInt(session.user.id, 10), siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  const oauth2Client = await getAuthenticatedClient(site.id);
  if (!oauth2Client) return NextResponse.json({ success: false, message: 'Google not connected' }, { status: 400 });

  const body = await req.json();
  const { siteUrl } = body;
  if (!siteUrl) return NextResponse.json({ success: false, message: 'siteUrl is required' }, { status: 400 });

  try {
    const webmasters = google.webmasters({ version: 'v3', auth: oauth2Client });

    // Try to add the site (no-op if already verified)
    await webmasters.sites.add({ siteUrl });

    // Save to DB
    await db
      .update(googleWebsiteTokens)
      .set({ gscSiteUrl: siteUrl, updatedAt: new Date() })
      .where(eq(googleWebsiteTokens.websiteId, site.id));

    return NextResponse.json({ success: true, data: { siteUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add Search Console site';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Disconnect Search Console (clear site URL, keep Google connection) */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveWebsite(parseInt(session.user.id, 10), siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  await db
    .update(googleWebsiteTokens)
    .set({ gscSiteUrl: null, updatedAt: new Date() })
    .where(eq(googleWebsiteTokens.websiteId, site.id));

  return NextResponse.json({ success: true });
}
