// SEO projects — list + create. Paid-module surface: every handler gates on
// the 'seo' service entitlement, and all reads/writes are scoped to the
// session-resolved client (never a client id from the request).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, seoCrawlRuns, seoProjects } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { validateWebhookUrl } from '@/lib/ssrf-guard';
import { canonicalHost, normalizeUrl } from '@/lib/seo/url';

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const projects = await db
    .select()
    .from(seoProjects)
    .where(eq(seoProjects.clientId, client.id))
    .orderBy(desc(seoProjects.createdAt));

  // Latest run per project — one query, newest-first, first-seen wins.
  const runs = projects.length
    ? await db
        .select({
          id: seoCrawlRuns.id,
          projectId: seoCrawlRuns.projectId,
          status: seoCrawlRuns.status,
          healthScore: seoCrawlRuns.healthScore,
          pagesCrawled: seoCrawlRuns.pagesCrawled,
          criticalCount: seoCrawlRuns.criticalCount,
          warningCount: seoCrawlRuns.warningCount,
          noticeCount: seoCrawlRuns.noticeCount,
          finishedAt: seoCrawlRuns.finishedAt,
          createdAt: seoCrawlRuns.createdAt,
        })
        .from(seoCrawlRuns)
        .where(inArray(seoCrawlRuns.projectId, projects.map((p) => p.id)))
        .orderBy(desc(seoCrawlRuns.createdAt))
    : [];
  const latestByProject = new Map<number, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByProject.has(run.projectId)) latestByProject.set(run.projectId, run);
  }

  return NextResponse.json({
    success: true,
    data: projects.map((p) => ({ ...p, latestRun: latestByProject.get(p.id) ?? null })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, startUrl, websiteId, maxPages, maxDepth, settings } = body ?? {};

  const normalized = typeof startUrl === 'string' ? normalizeUrl(startUrl.trim()) : null;
  if (!normalized) {
    return NextResponse.json({ success: false, message: 'A valid http(s) start URL is required' }, { status: 400 });
  }
  // Static SSRF screen at registration; the crawler re-asserts (with DNS
  // resolution) before every fetch.
  const urlCheck = validateWebhookUrl(normalized);
  if (!urlCheck.ok) {
    return NextResponse.json({ success: false, message: `URL rejected: ${urlCheck.reason}` }, { status: 400 });
  }

  // A hosted-site link must belong to this client — the id comes from the
  // request and proves nothing by itself.
  if (websiteId != null) {
    const [site] = await db
      .select({ id: clientWebsites.id })
      .from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, client.id)))
      .limit(1);
    if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });
  }

  const domain = canonicalHost(new URL(normalized).host);
  const [existing] = await db
    .select({ id: seoProjects.id })
    .from(seoProjects)
    .where(and(eq(seoProjects.clientId, client.id), eq(seoProjects.domain, domain)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ success: false, message: `A project for ${domain} already exists` }, { status: 409 });
  }

  const [project] = await db
    .insert(seoProjects)
    .values({
      clientId: client.id,
      websiteId: websiteId ?? null,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 255) : domain,
      domain,
      startUrl: normalized.slice(0, 500),
      maxPages: clampInt(maxPages, 10, 1000, 200),
      maxDepth: clampInt(maxDepth, 1, 10, 5),
      settings: sanitizeSettings(settings),
      createdBy: parseInt(session.user.id, 10),
    })
    .returning();

  return NextResponse.json({ success: true, data: project }, { status: 201 });
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function sanitizeSettings(v: unknown): { includePatterns?: string[]; excludePatterns?: string[]; ignoreQueryParams?: boolean } {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const strList = (x: unknown) =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 50) : undefined;
  return {
    includePatterns: strList(o.includePatterns),
    excludePatterns: strList(o.excludePatterns),
    ignoreQueryParams: typeof o.ignoreQueryParams === 'boolean' ? o.ignoreQueryParams : undefined,
  };
}
