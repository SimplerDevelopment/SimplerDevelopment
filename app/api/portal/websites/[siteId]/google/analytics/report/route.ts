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

/** Fetch GA4 analytics report: key metrics, daily timeseries, top pages, traffic sources */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await resolveWebsite(parseInt(session.user.id, 10), siteId);
  if (!site) {
    return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });
  }

  // Get GA property ID from DB
  const [token] = await db
    .select()
    .from(googleWebsiteTokens)
    .where(eq(googleWebsiteTokens.websiteId, site.id))
    .limit(1);

  if (!token?.gaPropertyId) {
    return NextResponse.json({ success: false, message: 'Analytics not configured' }, { status: 400 });
  }

  const oauth2Client = await getAuthenticatedClient(site.id);
  if (!oauth2Client) {
    return NextResponse.json({ success: false, message: 'Google not connected' }, { status: 400 });
  }

  // Parse date range from query params (default 30 days)
  const url = new URL(req.url);
  const range = url.searchParams.get('range') || '30';
  const days = Math.min(parseInt(range, 10) || 30, 90);
  const startDate = `${days}daysAgo`;
  const endDate = 'today';

  const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
  const propertyId = token.gaPropertyId;

  try {
    // Run all three report requests in parallel
    const [metricsRes, timeseriesRes, pagesRes, sourcesRes] = await Promise.all([
      // 1. Key metrics (aggregate)
      analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [
            { startDate, endDate },
            { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo`, name: 'previous' },
          ],
          metrics: [
            { name: 'totalUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'engagementRate' },
          ],
        },
      }),

      // 2. Daily timeseries (page views + users)
      analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'totalUsers' },
          ],
          orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' } }],
        },
      }),

      // 3. Top pages
      analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'totalUsers' },
            { name: 'averageSessionDuration' },
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: '10',
        },
      }),

      // 4. Traffic sources
      analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
          ],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: '8',
        },
      }),
    ]);

    // Parse key metrics
    const currentRow = metricsRes.data.rows?.[0];
    const previousRow = metricsRes.data.rows?.[1];

    function metricValue(row: typeof currentRow, index: number): number {
      return parseFloat(row?.metricValues?.[index]?.value || '0');
    }

    function percentChange(current: number, previous: number): number | null {
      if (previous === 0) return current > 0 ? 100 : null;
      return Math.round(((current - previous) / previous) * 100);
    }

    const metrics = {
      users: {
        value: metricValue(currentRow, 0),
        change: percentChange(metricValue(currentRow, 0), metricValue(previousRow, 0)),
      },
      sessions: {
        value: metricValue(currentRow, 1),
        change: percentChange(metricValue(currentRow, 1), metricValue(previousRow, 1)),
      },
      pageViews: {
        value: metricValue(currentRow, 2),
        change: percentChange(metricValue(currentRow, 2), metricValue(previousRow, 2)),
      },
      bounceRate: {
        value: Math.round(metricValue(currentRow, 3) * 100),
        change: percentChange(
          Math.round(metricValue(currentRow, 3) * 100),
          Math.round(metricValue(previousRow, 3) * 100),
        ),
      },
      avgSessionDuration: {
        value: Math.round(metricValue(currentRow, 4)),
        change: percentChange(metricValue(currentRow, 4), metricValue(previousRow, 4)),
      },
      engagementRate: {
        value: Math.round(metricValue(currentRow, 5) * 100),
        change: percentChange(
          Math.round(metricValue(currentRow, 5) * 100),
          Math.round(metricValue(previousRow, 5) * 100),
        ),
      },
    };

    // Parse timeseries
    const timeseries = (timeseriesRes.data.rows || []).map((row) => ({
      date: row.dimensionValues?.[0]?.value || '',
      pageViews: parseInt(row.metricValues?.[0]?.value || '0', 10),
      users: parseInt(row.metricValues?.[1]?.value || '0', 10),
    }));

    // Parse top pages
    const topPages = (pagesRes.data.rows || []).map((row) => ({
      path: row.dimensionValues?.[0]?.value || '',
      pageViews: parseInt(row.metricValues?.[0]?.value || '0', 10),
      users: parseInt(row.metricValues?.[1]?.value || '0', 10),
      avgDuration: Math.round(parseFloat(row.metricValues?.[2]?.value || '0')),
    }));

    // Parse traffic sources
    const trafficSources = (sourcesRes.data.rows || []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || '',
      sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
      users: parseInt(row.metricValues?.[1]?.value || '0', 10),
    }));

    return NextResponse.json({
      success: true,
      data: {
        range: days,
        metrics,
        timeseries,
        topPages,
        trafficSources,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch analytics report';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
