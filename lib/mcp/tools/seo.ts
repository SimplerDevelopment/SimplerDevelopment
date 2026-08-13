/**
 * MCP tools — SEO Intelligence (read-only).
 *
 * Slim, list/detail surface over the seo_projects / seo_crawl_runs /
 * seo_issues / seo_recommendations tables (see lib/db/schema/seo.ts). Every
 * tool follows the house three-gate pattern: scope check → service-entitlement
 * check → ownership check (cf. lib/mcp/tools/pitch-decks.ts).
 *
 * Deliberately read-only for now — crawl runs are triggered from the portal
 * UI (app/api/portal/seo/projects/[id]/crawl), not via MCP, so there's no
 * write surface to gate here yet.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { seoProjects, seoCrawlRuns, seoIssues, seoRecommendations } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { ruleById } from '@/lib/seo/rules';
import {
  json,
  denied,
  serviceDenied,
  requireScope,
  requireService,
} from '../types';

// Matches the severity ordering used by app/api/portal/seo/runs/[id]/issues —
// critical first, notice last, unknown severities sink to the bottom.
const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, notice: 2 };
const MAX_TOP_ISSUES = 15;

async function ownedProject(clientId: number, projectId: number) {
  const [project] = await db
    .select({
      id: seoProjects.id,
      name: seoProjects.name,
      domain: seoProjects.domain,
    })
    .from(seoProjects)
    .where(and(eq(seoProjects.id, projectId), eq(seoProjects.clientId, clientId)))
    .limit(1);
  return project ?? null;
}

export function registerSeoTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── SEO ──────────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'seo:read') && server.registerTool(
    'seo_projects_list',
    {
      title: 'List SEO projects',
      description:
        'List this client\'s SEO Intelligence projects (audited domains) with their latest crawl run summary. Use this to find a project id before calling seo_audit_get or seo_recommendations_list.',
      inputSchema: {
        activeOnly: z.boolean().optional().describe('When true, only return projects with active=true.'),
      },
    },
    async ({ activeOnly }) => {
      if (!requireScope(ctx, 'seo:read')) return denied('seo:read');
      if (!(await requireService(clientId, 'seo'))) return serviceDenied('seo');

      const conds = [eq(seoProjects.clientId, clientId)];
      if (activeOnly) conds.push(eq(seoProjects.active, true));
      const projects = await db
        .select({
          id: seoProjects.id,
          name: seoProjects.name,
          domain: seoProjects.domain,
          websiteId: seoProjects.websiteId,
          active: seoProjects.active,
        })
        .from(seoProjects)
        .where(and(...conds))
        .orderBy(desc(seoProjects.createdAt));

      // Latest run per project — one query, newest-first, first-seen wins
      // (mirrors app/api/portal/seo/projects/route.ts).
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

      const rows = projects.map((p) => {
        const run = latestByProject.get(p.id);
        return {
          id: p.id,
          name: p.name,
          domain: p.domain,
          websiteId: p.websiteId,
          active: p.active,
          latestRun: run
            ? {
                id: run.id,
                status: run.status,
                healthScore: run.healthScore,
                pagesCrawled: run.pagesCrawled,
                criticalCount: run.criticalCount,
                warningCount: run.warningCount,
                noticeCount: run.noticeCount,
                finishedAt: run.finishedAt,
              }
            : null,
        };
      });

      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'seo:read') && server.registerTool(
    'seo_audit_get',
    {
      title: 'Get SEO audit summary',
      description:
        'Fetch a project\'s latest completed crawl summary (health score, page/issue counts) plus its top issue groups by rule, sorted critical→warning→notice then by count. Use seo_projects_list first to find the projectId.',
      inputSchema: {
        projectId: z.number(),
      },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'seo:read')) return denied('seo:read');
      if (!(await requireService(clientId, 'seo'))) return serviceDenied('seo');

      const project = await ownedProject(clientId, projectId);
      if (!project) return json({ error: 'SEO project not found' });

      const [run] = await db
        .select({
          id: seoCrawlRuns.id,
          healthScore: seoCrawlRuns.healthScore,
          pagesCrawled: seoCrawlRuns.pagesCrawled,
          criticalCount: seoCrawlRuns.criticalCount,
          warningCount: seoCrawlRuns.warningCount,
          noticeCount: seoCrawlRuns.noticeCount,
          stats: seoCrawlRuns.stats,
          finishedAt: seoCrawlRuns.finishedAt,
        })
        .from(seoCrawlRuns)
        .where(
          and(
            eq(seoCrawlRuns.projectId, project.id),
            eq(seoCrawlRuns.clientId, clientId),
            eq(seoCrawlRuns.status, 'succeeded'),
          ),
        )
        .orderBy(desc(seoCrawlRuns.finishedAt))
        .limit(1);

      let topIssues: {
        ruleId: string;
        title: string;
        severity: string;
        category: string;
        count: number;
      }[] = [];

      if (run) {
        const issueRows = await db
          .select({
            ruleId: seoIssues.ruleId,
            category: seoIssues.category,
            severity: seoIssues.severity,
          })
          .from(seoIssues)
          .where(and(eq(seoIssues.runId, run.id), eq(seoIssues.clientId, clientId)));

        const groups = new Map<string, { ruleId: string; title: string; severity: string; category: string; count: number }>();
        for (const row of issueRows) {
          let g = groups.get(row.ruleId);
          if (!g) {
            const rule = ruleById.get(row.ruleId);
            g = {
              ruleId: row.ruleId,
              title: rule?.title ?? row.ruleId,
              severity: row.severity,
              category: row.category,
              count: 0,
            };
            groups.set(row.ruleId, g);
          }
          g.count++;
        }

        topIssues = [...groups.values()]
          .sort(
            (a, b) =>
              (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || b.count - a.count,
          )
          .slice(0, MAX_TOP_ISSUES);
      }

      return json({
        project: { id: project.id, name: project.name, domain: project.domain },
        run: run ?? null,
        topIssues,
      });
    }
  );

  hasScope(ctx.scopes, 'seo:read') && server.registerTool(
    'seo_recommendations_list',
    {
      title: 'List SEO recommendations',
      description:
        'List AI-generated SEO recommendations for a project, sorted by opportunity score (impact × confidence ÷ effort) descending. Returns slim rows with an evidence summary — not the full recommendation body (see the portal UI for that). Defaults to open recommendations.',
      inputSchema: {
        projectId: z.number(),
        status: z.enum(['open', 'done', 'dismissed']).default('open').optional(),
      },
    },
    async ({ projectId, status = 'open' }) => {
      if (!requireScope(ctx, 'seo:read')) return denied('seo:read');
      if (!(await requireService(clientId, 'seo'))) return serviceDenied('seo');

      const project = await ownedProject(clientId, projectId);
      if (!project) return json({ error: 'SEO project not found' });

      const rows = await db
        .select({
          id: seoRecommendations.id,
          title: seoRecommendations.title,
          impact: seoRecommendations.impact,
          effort: seoRecommendations.effort,
          confidence: seoRecommendations.confidence,
          opportunityScore: seoRecommendations.opportunityScore,
          status: seoRecommendations.status,
          evidence: seoRecommendations.evidence,
        })
        .from(seoRecommendations)
        .where(
          and(
            eq(seoRecommendations.projectId, project.id),
            eq(seoRecommendations.clientId, clientId),
            eq(seoRecommendations.status, status),
          ),
        )
        .orderBy(desc(seoRecommendations.opportunityScore));

      const slim = rows.map((r) => ({
        id: r.id,
        title: r.title,
        impact: r.impact,
        effort: r.effort,
        confidence: r.confidence,
        opportunityScore: r.opportunityScore,
        status: r.status,
        evidenceSummary: r.evidence?.summary ?? null,
      }));

      return json(slim);
    }
  );
}
