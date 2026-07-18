import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, googleWebsiteTokens } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { getAuthenticatedClient } from '@/lib/google-website-oauth';
import { google } from 'googleapis';
import { setEnvVars, createDeployment } from '@/lib/vercel';

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

/** List GA4 properties accessible to the user */
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
    const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth: oauth2Client });

    // List accounts first
    const accountsRes = await analyticsAdmin.accounts.list();
    const accounts = accountsRes.data.accounts || [];

    // List properties across all accounts
    const allProperties: Array<{ name: string; displayName: string; account: string }> = [];
    for (const account of accounts) {
      const propsRes = await analyticsAdmin.properties.list({
        filter: `parent:${account.name}`,
      });
      for (const prop of propsRes.data.properties || []) {
        allProperties.push({
          name: prop.name!,
          displayName: prop.displayName!,
          account: account.displayName || account.name!,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        accounts: accounts.map((a) => ({ name: a.name, displayName: a.displayName })),
        properties: allProperties,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list Analytics properties';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Select existing or create new GA4 property + data stream */
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
  const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth: oauth2Client });

  try {
    let propertyId: string;
    let measurementId: string;

    if (body.create && body.accountId) {
      // Create a new GA4 property
      const domain = site.domain || site.subdomain
        ? `${site.subdomain}.simplerdevelopment.com`
        : site.name;

      const propRes = await analyticsAdmin.properties.create({
        requestBody: {
          parent: body.accountId,
          displayName: body.displayName || site.name,
          timeZone: 'America/New_York',
          currencyCode: 'USD',
        },
      });
      propertyId = propRes.data.name!;

      // Create web data stream
      const streamRes = await analyticsAdmin.properties.dataStreams.create({
        parent: propertyId,
        requestBody: {
          type: 'WEB_DATA_STREAM',
          displayName: domain,
          webStreamData: {
            defaultUri: `https://${domain}`,
          },
        },
      });
      measurementId = streamRes.data.webStreamData?.measurementId || '';
    } else if (body.propertyId) {
      // Select existing property — find its web data stream
      propertyId = body.propertyId;

      const streamsRes = await analyticsAdmin.properties.dataStreams.list({
        parent: propertyId,
      });
      const webStream = (streamsRes.data.dataStreams || []).find(
        (s) => s.type === 'WEB_DATA_STREAM',
      );
      measurementId = webStream?.webStreamData?.measurementId || '';
    } else {
      return NextResponse.json(
        { success: false, message: 'Provide propertyId to select, or create:true + accountId to create' },
        { status: 400 },
      );
    }

    // Save to DB
    await db
      .update(googleWebsiteTokens)
      .set({
        gaPropertyId: propertyId,
        gaMeasurementId: measurementId || null,
        updatedAt: new Date(),
      })
      .where(eq(googleWebsiteTokens.websiteId, site.id));

    // Push measurement ID to Vercel if the site is deployed
    if (measurementId && site.vercelProjectId) {
      try {
        await setEnvVars(site.vercelProjectId, [
          { key: 'NEXT_PUBLIC_GA_MEASUREMENT_ID', value: measurementId },
        ]);
        // Trigger redeploy so the site picks up the new env var
        if (site.githubRepoName) {
          await createDeployment(site.vercelProjectId, site.githubRepoName);
        }
      } catch {
        // Non-fatal: env var push failed, user can set manually
      }
    }

    return NextResponse.json({
      success: true,
      data: { propertyId, measurementId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to configure Analytics';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Disconnect Analytics (clear GA fields, keep Google connection) */
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
    .set({ gaPropertyId: null, gaMeasurementId: null, updatedAt: new Date() })
    .where(eq(googleWebsiteTokens.websiteId, site.id));

  return NextResponse.json({ success: true });
}
