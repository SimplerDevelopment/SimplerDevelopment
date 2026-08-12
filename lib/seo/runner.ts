// SEO crawl runner — owns all persistence around the DB-free crawler engine.
// seo_crawl_runs doubles as the work queue: enqueueCrawlRun inserts a
// 'queued' row, the per-minute cron calls tickSeoCrawls, and the claim uses
// the house CAS pattern (re-assert the claimable predicate in the UPDATE;
// the racing tick matches 0 rows — cf. fire-due-jobs.ts). heartbeatAt is the
// lease: a 'running' row with a stale heartbeat was orphaned by a crashed or
// timed-out tick and becomes claimable again, resuming from its persisted
// frontier instead of restarting.
//
// Handlers are deliberately queue-agnostic: nothing here knows about cron
// specifics, so the tick can migrate onto internal_jobs (PR #47) unchanged.

import { db } from '@/lib/db';
import {
  seoCrawlPages,
  seoCrawlRuns,
  seoIssues,
  seoPageLinks,
  seoProjects,
  type SeoCrawlRun,
  type SeoIssue,
  type SeoProject,
} from '@/lib/db/schema';
import { and, asc, eq, lt, or, sql } from 'drizzle-orm';
import { bootstrapCrawl, crawlChunk } from './crawler';
import { normalizeUrl, urlHash } from './url';
import { deriveLinkMetrics } from './pagerank';
import { computeHealthScore, ruleById, runRules } from './rules';
import type { SeoRunContext } from './types';

const CHUNK_SIZE = 12;
const STALE_CLAIM_MS = 5 * 60_000;
// Soft wall-clock budget per tick — leaves headroom inside the cron route's
// 60s maxDuration for the finalize pass.
const TICK_SOFT_BUDGET_MS = 40_000;
// robotsTxt / sitemap lists are capped before entering jsonb run state.
const STATE_ROBOTS_CAP = 100_000;
const STATE_SITEMAP_URLS_CAP = 2_000;

export async function enqueueCrawlRun(
  project: Pick<SeoProject, 'id' | 'clientId'>,
  requestedBy?: number,
): Promise<{ runId: number; alreadyActive: boolean }> {
  const [active] = await db
    .select({ id: seoCrawlRuns.id })
    .from(seoCrawlRuns)
    .where(and(
      eq(seoCrawlRuns.projectId, project.id),
      or(eq(seoCrawlRuns.status, 'queued'), eq(seoCrawlRuns.status, 'running')),
    ))
    .limit(1);
  if (active) return { runId: active.id, alreadyActive: true };

  const [row] = await db
    .insert(seoCrawlRuns)
    .values({ projectId: project.id, clientId: project.clientId, requestedBy })
    .returning({ id: seoCrawlRuns.id });
  return { runId: row.id, alreadyActive: false };
}

export type TickResult = {
  claimed: boolean;
  runId?: number;
  pagesCrawled?: number;
  finished?: boolean;
  error?: string;
};

export async function tickSeoCrawls(now: Date = new Date()): Promise<TickResult> {
  const staleCutoff = new Date(now.getTime() - STALE_CLAIM_MS);
  const claimable = or(
    eq(seoCrawlRuns.status, 'queued'),
    and(eq(seoCrawlRuns.status, 'running'), lt(seoCrawlRuns.heartbeatAt, staleCutoff)),
  );

  const [candidate] = await db
    .select()
    .from(seoCrawlRuns)
    .where(claimable)
    .orderBy(asc(seoCrawlRuns.createdAt))
    .limit(1);
  if (!candidate) return { claimed: false };

  const claimed = await db
    .update(seoCrawlRuns)
    .set({
      status: 'running',
      startedAt: candidate.startedAt ?? now,
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(and(eq(seoCrawlRuns.id, candidate.id), claimable))
    .returning();
  if (claimed.length === 0) return { claimed: false }; // racing tick won

  const run = claimed[0];
  try {
    return await processRun(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(seoCrawlRuns)
      .set({ status: 'failed', error: message, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(seoCrawlRuns.id, run.id));
    return { claimed: true, runId: run.id, error: message };
  }
}

async function processRun(run: SeoCrawlRun): Promise<TickResult> {
  const started = Date.now();
  const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, run.projectId));
  if (!project) throw new Error(`seo project ${run.projectId} missing`);

  const seed = normalizeUrl(project.startUrl);
  if (!seed) throw new Error(`invalid start URL: ${project.startUrl}`);
  const baseUrl = new URL(seed).origin;
  const settings = project.settings ?? {};

  let state = run.state ?? {};
  let pagesCrawled = run.pagesCrawled;

  if (!state.frontier) {
    const boot = await bootstrapCrawl(project.startUrl, { ignoreQueryParams: settings.ignoreQueryParams });
    state = {
      frontier: boot.frontier,
      seen: boot.frontier.map((f) => f.url),
      sitemapUrls: boot.sitemapUrls.slice(0, STATE_SITEMAP_URLS_CAP),
      robotsTxt: boot.robotsTxt ? boot.robotsTxt.slice(0, STATE_ROBOTS_CAP) : null,
    };
    await persistState(run.id, state, pagesCrawled);
  }

  while (
    (state.frontier?.length ?? 0) > 0 &&
    pagesCrawled < project.maxPages &&
    Date.now() - started < TICK_SOFT_BUDGET_MS
  ) {
    const out = await crawlChunk({
      frontier: state.frontier ?? [],
      seen: state.seen ?? [],
      baseUrl,
      robotsTxt: state.robotsTxt ?? null,
      settings,
      maxDepth: project.maxDepth,
      pageBudget: project.maxPages - pagesCrawled,
      chunkSize: CHUNK_SIZE,
    });

    await persistChunk(run, out.pages);
    pagesCrawled += out.pages.length;
    state = { ...state, frontier: out.frontier, seen: out.seen };
    await persistState(run.id, state, pagesCrawled);
  }

  const exhausted = (state.frontier?.length ?? 0) === 0 || pagesCrawled >= project.maxPages;
  if (!exhausted) {
    // Budget spent — leave the run 'running'; the next tick re-claims it via
    // the stale-heartbeat path or continues immediately if picked first.
    return { claimed: true, runId: run.id, pagesCrawled, finished: false };
  }

  await finalizeRun(run, baseUrl, state, pagesCrawled);
  return { claimed: true, runId: run.id, pagesCrawled, finished: true };
}

async function persistState(runId: number, state: NonNullable<SeoCrawlRun['state']>, pagesCrawled: number) {
  await db
    .update(seoCrawlRuns)
    .set({ state, pagesCrawled, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(eq(seoCrawlRuns.id, runId));
}

type ChunkPages = Awaited<ReturnType<typeof crawlChunk>>['pages'];

const cap = (s: string | null | undefined, n: number) => (s == null ? s ?? null : s.slice(0, n));

async function persistChunk(run: SeoCrawlRun, pages: ChunkPages) {
  if (pages.length === 0) return;

  const pageRows = pages.map(({ page }) => ({
    ...page,
    url: page.url.slice(0, 2048),
    finalUrl: cap(page.finalUrl, 2048),
    canonicalUrl: cap(page.canonicalUrl, 2048),
    runId: run.id,
    projectId: run.projectId,
    clientId: run.clientId,
  }));
  const inserted = await db
    .insert(seoCrawlPages)
    .values(pageRows)
    .returning({ id: seoCrawlPages.id, url: seoCrawlPages.url });
  const idByUrl = new Map(inserted.map((r) => [r.url, r.id]));

  const linkRows = pages.flatMap(({ page, links }) => {
    const fromPageId = idByUrl.get(page.url.slice(0, 2048));
    if (!fromPageId) return [];
    return links.map((l) => ({
      runId: run.id,
      clientId: run.clientId,
      fromPageId,
      toUrl: l.href.slice(0, 2048),
      toUrlHash: urlHash(l.href),
      anchorText: cap(l.anchorText, 512),
      isInternal: l.isInternal,
      nofollow: l.nofollow,
    }));
  });
  // Bulk insert in slices to stay under the postgres parameter limit.
  for (let i = 0; i < linkRows.length; i += 1000) {
    await db.insert(seoPageLinks).values(linkRows.slice(i, i + 1000));
  }
}

async function finalizeRun(
  run: SeoCrawlRun,
  baseUrl: string,
  state: NonNullable<SeoCrawlRun['state']>,
  pagesCrawled: number,
) {
  // Resolve internal link targets to crawled page rows in one statement.
  await db.execute(sql`
    UPDATE seo_page_links l
    SET to_page_id = p.id
    FROM seo_crawl_pages p
    WHERE l.run_id = ${run.id}
      AND p.run_id = ${run.id}
      AND l.is_internal = true
      AND p.url_hash = l.to_url_hash
  `);

  const pages = await db.select().from(seoCrawlPages).where(eq(seoCrawlPages.runId, run.id));
  const links = await db.select().from(seoPageLinks).where(eq(seoPageLinks.runId, run.id));

  const internalEdges = links
    .filter((l) => l.isInternal && l.toPageId != null)
    .map((l) => ({ from: l.fromPageId, to: l.toPageId! }));
  const metrics = deriveLinkMetrics(pages.map((p) => ({ id: p.id, depth: p.depth })), internalEdges);

  if (metrics.size > 0) {
    const ids: number[] = [];
    const ranks: number[] = [];
    const incs: number[] = [];
    const orphans: boolean[] = [];
    for (const [id, m] of metrics) {
      ids.push(id);
      ranks.push(m.internalRank);
      incs.push(m.incomingLinks);
      orphans.push(m.orphan);
    }
    await db.execute(sql`
      UPDATE seo_crawl_pages p
      SET internal_rank = v.rank, incoming_links = v.inc, orphan = v.orph
      FROM (
        SELECT * FROM unnest(
          ${ids}::bigint[], ${ranks}::real[], ${incs}::int[], ${orphans}::boolean[]
        ) AS t(id, rank, inc, orph)
      ) v
      WHERE p.id = v.id AND p.run_id = ${run.id}
    `);
    for (const p of pages) {
      const m = metrics.get(p.id);
      if (m) {
        p.internalRank = m.internalRank;
        p.incomingLinks = m.incomingLinks;
        p.orphan = m.orphan;
      }
    }
  }

  const ctx: SeoRunContext = {
    baseUrl,
    pages,
    links,
    sitemapUrls: state.sitemapUrls ?? [],
    robotsTxt: state.robotsTxt ?? null,
  };
  const drafts = runRules(ctx);

  const idByUrl = new Map(pages.map((p) => [p.url, p.id]));
  const issueRows = drafts.map((d) => {
    const rule = ruleById.get(d.ruleId);
    return {
      runId: run.id,
      projectId: run.projectId,
      clientId: run.clientId,
      pageId: d.pageUrl ? idByUrl.get(d.pageUrl) ?? null : null,
      ruleId: d.ruleId,
      category: rule?.category ?? 'crawlability',
      severity: rule?.severity ?? 'notice',
      details: d.details ?? {},
    };
  });
  for (let i = 0; i < issueRows.length; i += 1000) {
    await db.insert(seoIssues).values(issueRows.slice(i, i + 1000));
  }

  const bySeverity = { critical: 0, warning: 0, notice: 0 } as Record<string, number>;
  const issuesByCategory: Record<string, number> = {};
  for (const row of issueRows as Pick<SeoIssue, 'severity' | 'category'>[]) {
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
    issuesByCategory[row.category] = (issuesByCategory[row.category] ?? 0) + 1;
  }
  const statusCodes: Record<string, number> = {};
  const depthDistribution: Record<string, number> = {};
  let indexable = 0;
  for (const p of pages) {
    const code = p.httpStatus == null ? 'error' : String(p.httpStatus);
    statusCodes[code] = (statusCodes[code] ?? 0) + 1;
    depthDistribution[String(p.depth)] = (depthDistribution[String(p.depth)] ?? 0) + 1;
    if (p.indexable) indexable++;
  }

  await db
    .update(seoCrawlRuns)
    .set({
      status: 'succeeded',
      finishedAt: new Date(),
      updatedAt: new Date(),
      pagesCrawled,
      healthScore: computeHealthScore(pages.length, drafts),
      criticalCount: bySeverity.critical,
      warningCount: bySeverity.warning,
      noticeCount: bySeverity.notice,
      stats: { statusCodes, depthDistribution, indexable, nonIndexable: pages.length - indexable, issuesByCategory },
      // Frontier/seen served their purpose — drop the bulky state now that
      // the run is terminal, keep the light audit-context bits.
      state: { sitemapUrls: state.sitemapUrls, robotsTxt: state.robotsTxt },
    })
    .where(eq(seoCrawlRuns.id, run.id));
}
