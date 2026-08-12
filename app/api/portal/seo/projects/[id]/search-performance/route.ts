// Search Performance tab data — one call for the whole tab: connection
// state, overview timeseries, and all derived reports. Derivations live in
// lib/seo/gsc-reports.ts; this route only proves ownership and assembles.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoGscQueryDaily, seoProjects } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { gscConnectionForProject } from '@/lib/seo/gsc';
import {
  getCtrOpportunities,
  getNewLostQueries,
  getPageDecay,
  getSearchOverview,
  getStrikingDistance,
  getWinnersLosers,
} from '@/lib/seo/gsc-reports';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [project] = await db
    .select()
    .from(seoProjects)
    .where(and(eq(seoProjects.id, id), eq(seoProjects.clientId, client.id)))
    .limit(1);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const connection = await gscConnectionForProject(project);
  if (!connection) {
    return NextResponse.json({
      success: true,
      data: { connected: false, siteUrl: null, lastDate: null, overview: null, reports: null },
    });
  }

  const [latest] = await db
    .select({ maxDate: sql<string | null>`max(${seoGscQueryDaily.date})` })
    .from(seoGscQueryDaily)
    .where(eq(seoGscQueryDaily.projectId, project.id));
  const lastDate = latest?.maxDate ?? null;

  if (!lastDate) {
    return NextResponse.json({
      success: true,
      data: { connected: true, siteUrl: connection.siteUrl, lastDate: null, overview: null, reports: null },
    });
  }

  const [overview, winnersLosers, newLost, ctrOpportunities, strikingDistance, pageDecay] = await Promise.all([
    getSearchOverview(project.id),
    getWinnersLosers(project.id),
    getNewLostQueries(project.id),
    getCtrOpportunities(project.id),
    getStrikingDistance(project.id),
    getPageDecay(project.id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      connected: true,
      siteUrl: connection.siteUrl,
      lastDate,
      overview,
      reports: {
        winners: winnersLosers.winners,
        losers: winnersLosers.losers,
        newQueries: newLost.newQueries,
        lostQueries: newLost.lostQueries,
        ctrOpportunities,
        strikingDistance,
        pageDecay,
      },
    },
  });
}
