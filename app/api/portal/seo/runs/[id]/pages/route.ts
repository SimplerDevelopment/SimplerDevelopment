// Crawled pages for a run — the Pages tab's table. Slim projection (no meta
// jsonb, no redirect chains); a run is capped at seo_projects.maxPages rows
// so this returns the whole set and the client sorts locally.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoCrawlPages, seoCrawlRuns } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

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

  const [run] = await db
    .select({ id: seoCrawlRuns.id })
    .from(seoCrawlRuns)
    .where(and(eq(seoCrawlRuns.id, id), eq(seoCrawlRuns.clientId, client.id)))
    .limit(1);
  if (!run) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const pages = await db
    .select({
      id: seoCrawlPages.id,
      url: seoCrawlPages.url,
      httpStatus: seoCrawlPages.httpStatus,
      title: seoCrawlPages.title,
      metaDescription: seoCrawlPages.metaDescription,
      canonicalUrl: seoCrawlPages.canonicalUrl,
      indexable: seoCrawlPages.indexable,
      indexabilityReason: seoCrawlPages.indexabilityReason,
      depth: seoCrawlPages.depth,
      discoveredFrom: seoCrawlPages.discoveredFrom,
      wordCount: seoCrawlPages.wordCount,
      internalLinksCount: seoCrawlPages.internalLinksCount,
      externalLinksCount: seoCrawlPages.externalLinksCount,
      imagesMissingAlt: seoCrawlPages.imagesMissingAlt,
      responseTimeMs: seoCrawlPages.responseTimeMs,
      internalRank: seoCrawlPages.internalRank,
      incomingLinks: seoCrawlPages.incomingLinks,
      orphan: seoCrawlPages.orphan,
    })
    .from(seoCrawlPages)
    .where(and(eq(seoCrawlPages.runId, run.id), eq(seoCrawlPages.clientId, client.id)))
    .orderBy(desc(seoCrawlPages.internalRank));

  return NextResponse.json({ success: true, data: pages });
}
