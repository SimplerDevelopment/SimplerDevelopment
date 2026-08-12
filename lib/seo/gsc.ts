// Search Console import for SEO projects. Reuses the per-website Google
// OAuth connection (lib/google-website-oauth.ts — the webmasters scope has
// been part of GOOGLE_SCOPES since the GA integration shipped, so existing
// connections need no re-auth). Only projects linked to a hosted website
// with a connected gscSiteUrl can import; external-domain projects surface a
// connect-GSC empty state in the UI instead.
//
// Import strategy: one Search Analytics query per dimension table with
// dimensions ['date', <dim>] — the date key comes back per row, so a whole
// date range lands in one paginated call instead of a call per day.
// Incremental: resumes from max(date)+1, first import backfills 90 days.
// GSC data lags ~2-3 days, so the end date is always today-3 — re-importing
// a recent date upserts (idempotent) rather than duplicating.

import { google } from 'googleapis';
import { db } from '@/lib/db';
import {
  googleWebsiteTokens,
  seoGscPageDaily,
  seoGscQueryDaily,
  type SeoProject,
} from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAuthenticatedClient } from '@/lib/google-website-oauth';

const DATA_LAG_DAYS = 3;
const BACKFILL_DAYS = 90;
const API_ROW_LIMIT = 25_000; // Search Analytics per-request max
// ponytail: two API pages per dimension per import (50k rows) — enough for
// every site we host today; bulk-export API if a tenant outgrows it.
const MAX_ROWS_PER_DIMENSION = 50_000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

export type GscImportResult =
  | { imported: { queries: number; pages: number }; startDate: string; endDate: string }
  | { skipped: 'not-linked' | 'not-connected' | 'up-to-date' };

/** The connected GSC property for a project, or null. */
export async function gscConnectionForProject(
  project: Pick<SeoProject, 'websiteId'>,
): Promise<{ websiteId: number; siteUrl: string } | null> {
  if (project.websiteId == null) return null;
  const [token] = await db
    .select({ gscSiteUrl: googleWebsiteTokens.gscSiteUrl })
    .from(googleWebsiteTokens)
    .where(eq(googleWebsiteTokens.websiteId, project.websiteId))
    .limit(1);
  if (!token?.gscSiteUrl) return null;
  return { websiteId: project.websiteId, siteUrl: token.gscSiteUrl };
}

export async function importGscForProject(project: SeoProject): Promise<GscImportResult> {
  if (project.websiteId == null) return { skipped: 'not-linked' };
  const connection = await gscConnectionForProject(project);
  if (!connection) return { skipped: 'not-connected' };

  const authClient = await getAuthenticatedClient(connection.websiteId);
  if (!authClient) return { skipped: 'not-connected' };

  const endDate = isoDate(daysAgo(DATA_LAG_DAYS));
  const [latest] = await db
    .select({ maxDate: sql<string | null>`max(${seoGscQueryDaily.date})` })
    .from(seoGscQueryDaily)
    .where(eq(seoGscQueryDaily.projectId, project.id));
  const startDate = latest?.maxDate
    ? isoDate(new Date(new Date(`${latest.maxDate}T00:00:00Z`).getTime() + 86_400_000))
    : isoDate(daysAgo(DATA_LAG_DAYS + BACKFILL_DAYS));
  if (startDate > endDate) return { skipped: 'up-to-date' };

  const searchconsole = google.searchconsole({ version: 'v1', auth: authClient });

  async function fetchRows(dim: 'query' | 'page') {
    const rows: { keys?: string[] | null; clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }[] = [];
    for (let startRow = 0; startRow < MAX_ROWS_PER_DIMENSION; startRow += API_ROW_LIMIT) {
      const res = await searchconsole.searchanalytics.query({
        siteUrl: connection!.siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ['date', dim],
          rowLimit: API_ROW_LIMIT,
          startRow,
        },
      });
      const page = res.data.rows ?? [];
      rows.push(...page);
      if (page.length < API_ROW_LIMIT) break;
    }
    return rows;
  }

  const [queryRows, pageRows] = [await fetchRows('query'), await fetchRows('page')];

  const upsertSet = {
    clicks: sql`excluded.clicks`,
    impressions: sql`excluded.impressions`,
    ctr: sql`excluded.ctr`,
    position: sql`excluded.position`,
  };

  const queryValues = queryRows
    .filter((r) => r.keys?.[0] && r.keys?.[1])
    .map((r) => ({
      projectId: project.id,
      clientId: project.clientId,
      date: r.keys![0],
      query: r.keys![1].slice(0, 512),
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
  for (let i = 0; i < queryValues.length; i += 1000) {
    await db
      .insert(seoGscQueryDaily)
      .values(queryValues.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: [seoGscQueryDaily.projectId, seoGscQueryDaily.date, seoGscQueryDaily.query],
        set: upsertSet,
      });
  }

  const pageValues = pageRows
    .filter((r) => r.keys?.[0] && r.keys?.[1])
    .map((r) => ({
      projectId: project.id,
      clientId: project.clientId,
      date: r.keys![0],
      page: r.keys![1].slice(0, 2048),
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
  for (let i = 0; i < pageValues.length; i += 1000) {
    await db
      .insert(seoGscPageDaily)
      .values(pageValues.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: [seoGscPageDaily.projectId, seoGscPageDaily.date, seoGscPageDaily.page],
        set: upsertSet,
      });
  }

  return { imported: { queries: queryValues.length, pages: pageValues.length }, startDate, endDate };
}
