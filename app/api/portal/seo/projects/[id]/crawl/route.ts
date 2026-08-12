// Start a crawl for an SEO project. Enqueue-only — the per-minute
// seo-crawl-tick cron does the actual work, so this returns immediately with
// the run id (existing active run's id when one is already going: starting a
// crawl is idempotent, not a way to stack duplicate runs).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoProjects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { enqueueCrawlRun } from '@/lib/seo/runner';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'seo' });
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
  if (!project.active) {
    return NextResponse.json({ success: false, message: 'Project is inactive' }, { status: 400 });
  }

  const { runId, alreadyActive } = await enqueueCrawlRun(project, parseInt(session.user.id, 10));
  return NextResponse.json(
    { success: true, data: { runId, alreadyActive } },
    { status: alreadyActive ? 200 : 202 },
  );
}
