// Single SEO project — detail (with recent runs), update, delete. Ownership
// is proven by clientId on the row, never by the URL param alone.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoCrawlRuns, seoProjects } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

type Params = { params: Promise<{ id: string }> };

async function ownedProject(clientId: number, idRaw: string) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return null;
  const [project] = await db
    .select()
    .from(seoProjects)
    .where(and(eq(seoProjects.id, id), eq(seoProjects.clientId, clientId)))
    .limit(1);
  return project ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const project = await ownedProject(client.id, (await params).id);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const runs = await db
    .select({
      id: seoCrawlRuns.id,
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
    .where(eq(seoCrawlRuns.projectId, project.id))
    .orderBy(desc(seoCrawlRuns.createdAt))
    .limit(10);

  return NextResponse.json({ success: true, data: { ...project, runs } });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const project = await ownedProject(client.id, (await params).id);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const patch: Partial<typeof seoProjects.$inferInsert> = { updatedAt: new Date() };
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 255);
  if (typeof body?.active === 'boolean') patch.active = body.active;
  if (body?.maxPages != null) patch.maxPages = clampInt(body.maxPages, 10, 1000, project.maxPages);
  if (body?.maxDepth != null) patch.maxDepth = clampInt(body.maxDepth, 1, 10, project.maxDepth);
  if (body?.settings && typeof body.settings === 'object') {
    const o = body.settings as Record<string, unknown>;
    const strList = (x: unknown) =>
      Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 50) : undefined;
    patch.settings = {
      includePatterns: strList(o.includePatterns),
      excludePatterns: strList(o.excludePatterns),
      ignoreQueryParams: typeof o.ignoreQueryParams === 'boolean' ? o.ignoreQueryParams : undefined,
    };
  }

  const [updated] = await db
    .update(seoProjects)
    .set(patch)
    .where(and(eq(seoProjects.id, project.id), eq(seoProjects.clientId, client.id)))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const project = await ownedProject(client.id, (await params).id);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Cascades take runs/pages/links/issues/recommendations with the project.
  await db.delete(seoProjects).where(and(eq(seoProjects.id, project.id), eq(seoProjects.clientId, client.id)));

  return NextResponse.json({ success: true, data: { id: project.id } });
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
