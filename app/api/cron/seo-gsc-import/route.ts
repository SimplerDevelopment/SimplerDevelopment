// Daily cron: imports Search Console history for every active SEO project
// linked to a hosted website with a connected GSC property. Incremental per
// project (resumes from max imported date), upserts are idempotent, and one
// project's failure never blocks the rest.

import { NextResponse, type NextRequest } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { seoProjects } from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { importGscForProject } from '@/lib/seo/gsc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // network-bound: a fresh project backfills 90 days

async function _GET(req: Request) {
  if (!isAuthorizedCron(req as NextRequest)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const candidates = await db
    .select()
    .from(seoProjects)
    .where(and(eq(seoProjects.active, true), isNotNull(seoProjects.websiteId)));

  const results: Record<string, unknown> = {};
  for (const project of candidates) {
    try {
      results[String(project.id)] = await importGscForProject(project);
    } catch (err) {
      results[String(project.id)] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ success: true, data: results });
}

export const GET = withCronHealth(
  { name: 'api-cron:seo-gsc-import', area: 'api-cron' },
  _GET,
);
