// Audit issues for a run, grouped by rule with the rule registry's prose
// (description / why-it-matters / how-to-fix) attached — the registry is the
// source of truth for rule copy; issue rows only persist the finding.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoCrawlPages, seoCrawlRuns, seoIssues } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { ruleById } from '@/lib/seo/rules';

type Params = { params: Promise<{ id: string }> };

const SAMPLE_PAGES_PER_RULE = 25;
const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, notice: 2 };

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

  const rows = await db
    .select({
      id: seoIssues.id,
      ruleId: seoIssues.ruleId,
      category: seoIssues.category,
      severity: seoIssues.severity,
      pageId: seoIssues.pageId,
      pageUrl: seoCrawlPages.url,
      details: seoIssues.details,
    })
    .from(seoIssues)
    .leftJoin(seoCrawlPages, eq(seoIssues.pageId, seoCrawlPages.id))
    .where(and(eq(seoIssues.runId, run.id), eq(seoIssues.clientId, client.id)));

  type Group = {
    ruleId: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    whyItMatters: string;
    howToFix: string;
    count: number;
    pages: { id: number | null; url: string | null; details: Record<string, unknown> }[];
  };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    let g = groups.get(row.ruleId);
    if (!g) {
      const rule = ruleById.get(row.ruleId);
      g = {
        ruleId: row.ruleId,
        category: row.category,
        severity: row.severity,
        title: rule?.title ?? row.ruleId,
        description: rule?.description ?? '',
        whyItMatters: rule?.whyItMatters ?? '',
        howToFix: rule?.howToFix ?? '',
        count: 0,
        pages: [],
      };
      groups.set(row.ruleId, g);
    }
    g.count++;
    if (g.pages.length < SAMPLE_PAGES_PER_RULE) {
      g.pages.push({ id: row.pageId, url: row.pageUrl, details: row.details });
    }
  }

  const data = [...groups.values()].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || b.count - a.count,
  );

  return NextResponse.json({ success: true, data });
}
