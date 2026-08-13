// AI recommendations — the "here are the N things worth doing" layer, and
// deliberately NOT another wall of charts. On-demand only: a tenant clicks
// generate and pays the metered AI cost; nothing generates in the background.
//
// Evidence in, prioritized actions out: the prompt carries the latest audit
// (issue groups, health, weak/orphan pages) plus GSC-derived opportunities
// when the project has Search Console data. Each generation REPLACES the
// project's still-open recommendations (done/dismissed survive — they're the
// tenant's history, not ours to regenerate).

import { z } from 'zod';
import { db } from '@/lib/db';
import {
  seoCrawlPages,
  seoCrawlRuns,
  seoIssues,
  seoRecommendations,
  type SeoProject,
  type SeoRecommendation,
} from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { completeObject } from '@/lib/ai/llm';
import { recordAiUsage } from '@/lib/ai/audit';
import { ruleById } from './rules';
import { getCtrOpportunities, getPageDecay, getStrikingDistance } from './gsc-reports';

const MAX_RECOMMENDATIONS = 7;
const WEIGHT: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };

const recommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string().max(255),
        body: z.string().describe('The concrete action and reasoning, markdown, written to the site owner'),
        impact: z.enum(['high', 'medium', 'low']),
        effort: z.enum(['high', 'medium', 'low']),
        confidence: z.number().min(0).max(1),
        evidence: z.object({
          ruleIds: z.array(z.string()).optional(),
          urls: z.array(z.string()).max(10).optional(),
          summary: z.string().describe('One sentence citing the specific numbers this rests on'),
        }),
      }),
    )
    .max(MAX_RECOMMENDATIONS),
});

export function opportunityScore(impact: 'high' | 'medium' | 'low', effort: 'high' | 'medium' | 'low', confidence: number): number {
  return Math.round(((WEIGHT[impact] * confidence) / WEIGHT[effort]) * 100) / 100;
}

async function buildEvidence(project: SeoProject): Promise<{ prompt: string; runId: number | null }> {
  const [run] = await db
    .select()
    .from(seoCrawlRuns)
    .where(and(eq(seoCrawlRuns.projectId, project.id), eq(seoCrawlRuns.status, 'succeeded')))
    .orderBy(desc(seoCrawlRuns.finishedAt))
    .limit(1);

  const sections: string[] = [`Domain: ${project.domain}`];

  if (run) {
    sections.push(
      `Latest audit: ${run.pagesCrawled} pages crawled, health score ${run.healthScore ?? 'n/a'}/100, ` +
        `${run.criticalCount} critical / ${run.warningCount} warning / ${run.noticeCount} notice issues.`,
    );

    const groups = await db
      .select({ ruleId: seoIssues.ruleId, severity: seoIssues.severity, count: sql<number>`count(*)::int` })
      .from(seoIssues)
      .where(eq(seoIssues.runId, run.id))
      .groupBy(seoIssues.ruleId, seoIssues.severity)
      .orderBy(desc(sql`count(*)`))
      .limit(25);
    if (groups.length) {
      sections.push(
        'Issues (ruleId — severity — affected count — what it is):\n' +
          groups
            .map((g) => {
              const rule = ruleById.get(g.ruleId);
              return `- ${g.ruleId} — ${g.severity} — ${g.count} — ${rule?.title ?? ''}`;
            })
            .join('\n'),
      );
    }

    const weakPages = await db
      .select({ url: seoCrawlPages.url, internalRank: seoCrawlPages.internalRank, incomingLinks: seoCrawlPages.incomingLinks, orphan: seoCrawlPages.orphan })
      .from(seoCrawlPages)
      .where(and(eq(seoCrawlPages.runId, run.id), eq(seoCrawlPages.indexable, true)))
      .orderBy(asc(seoCrawlPages.internalRank))
      .limit(8);
    if (weakPages.length) {
      sections.push(
        'Weakest internal-authority pages (url — incoming links — orphan):\n' +
          weakPages.map((p) => `- ${p.url} — ${p.incomingLinks} — ${p.orphan ? 'yes' : 'no'}`).join('\n'),
      );
    }
  } else {
    sections.push('No completed audit yet.');
  }

  // GSC evidence is optional — external-domain projects have none.
  const [ctr, striking, decay] = await Promise.all([
    getCtrOpportunities(project.id).catch(() => []),
    getStrikingDistance(project.id).catch(() => []),
    getPageDecay(project.id).catch(() => []),
  ]);
  if (ctr.length) {
    sections.push(
      'CTR opportunities (query — impressions — ctr — position):\n' +
        ctr.slice(0, 10).map((q) => `- "${q.query}" — ${q.impressions} — ${(q.ctr * 100).toFixed(1)}% — ${q.position.toFixed(1)}`).join('\n'),
    );
  }
  if (striking.length) {
    sections.push(
      'Striking-distance queries (position 5-15, by impressions):\n' +
        striking.slice(0, 10).map((q) => `- "${q.query}" — ${q.impressions} imp — pos ${q.position.toFixed(1)}`).join('\n'),
    );
  }
  if (decay.length) {
    sections.push(
      'Decaying pages (page — clicks now vs prior window):\n' +
        decay.slice(0, 8).map((p) => `- ${p.page} — ${p.clicks} vs ${p.prevClicks} (-${p.declinePct.toFixed(0)}%)`).join('\n'),
    );
  }

  return { prompt: sections.join('\n\n'), runId: run?.id ?? null };
}

export async function generateRecommendations(project: SeoProject): Promise<SeoRecommendation[]> {
  const { prompt, runId } = await buildEvidence(project);

  const { object, usage } = await completeObject({
    task: 'seoRecommendations',
    clientId: project.clientId,
    schema: recommendationSchema,
    system: [
      'You are an SEO lead producing a prioritized action list for a site owner.',
      `Produce at most ${MAX_RECOMMENDATIONS} recommendations — the changes most likely to increase this site's organic traffic, not an inventory of every issue.`,
      'Every recommendation must rest on the evidence provided: cite the specific rule ids, URLs, and numbers in the evidence field. Never invent data.',
      'Prefer compounding fixes (internal linking, titles on striking-distance queries, decaying-content refreshes) over cosmetic ones.',
      'Write body text to a non-SEO business owner: what to do, where, and why it will help.',
    ].join(' '),
    prompt,
    maxTokens: 4000,
  });

  void recordAiUsage({
    clientId: project.clientId,
    source: 'platform',
    tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
  });

  // Replace open recommendations atomically-enough: delete open, insert new.
  const rows = object.recommendations.map((r) => ({
    projectId: project.id,
    clientId: project.clientId,
    runId,
    title: r.title.slice(0, 255),
    body: r.body,
    impact: r.impact,
    effort: r.effort,
    confidence: r.confidence,
    opportunityScore: opportunityScore(r.impact, r.effort, r.confidence),
    evidence: r.evidence,
  }));

  return db.transaction(async (tx) => {
    await tx
      .delete(seoRecommendations)
      .where(and(eq(seoRecommendations.projectId, project.id), eq(seoRecommendations.status, 'open')));
    if (rows.length === 0) return [];
    const inserted = await tx.insert(seoRecommendations).values(rows).returning();
    return inserted.sort((a, b) => b.opportunityScore - a.opportunityScore);
  });
}
