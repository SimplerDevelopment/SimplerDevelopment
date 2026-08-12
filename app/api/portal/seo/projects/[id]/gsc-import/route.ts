// On-demand Search Console import — the connect-flow's "import now" action.
// Runs inline (first import backfills 90 days, typically a few seconds of
// API paging); the daily seo-gsc-import cron keeps it fresh afterwards.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoProjects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { importGscForProject } from '@/lib/seo/gsc';

export const maxDuration = 60;

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

  try {
    const result = await importGscForProject(project);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search Console import failed';
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
