// Crawl-run status — polled by the audit UI while a crawl is running.
// Slim projection: run state (frontier/seen) stays server-side.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoCrawlRuns } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
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
    .select({
      id: seoCrawlRuns.id,
      projectId: seoCrawlRuns.projectId,
      status: seoCrawlRuns.status,
      pagesCrawled: seoCrawlRuns.pagesCrawled,
      healthScore: seoCrawlRuns.healthScore,
      criticalCount: seoCrawlRuns.criticalCount,
      warningCount: seoCrawlRuns.warningCount,
      noticeCount: seoCrawlRuns.noticeCount,
      stats: seoCrawlRuns.stats,
      error: seoCrawlRuns.error,
      startedAt: seoCrawlRuns.startedAt,
      finishedAt: seoCrawlRuns.finishedAt,
      createdAt: seoCrawlRuns.createdAt,
    })
    .from(seoCrawlRuns)
    .where(and(eq(seoCrawlRuns.id, id), eq(seoCrawlRuns.clientId, client.id)))
    .limit(1);
  if (!run) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: run });
}
