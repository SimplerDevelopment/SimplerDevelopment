// Aggregates every category module into the rule registry the audit runner
// drives. Rule ids are persisted forever on seo_issues.rule_id, so a
// duplicate id here would silently merge two different findings under one
// id — fail loudly at module load rather than at audit time.

import type { SeoIssueDraft, SeoRule, SeoRunContext, SeoSeverity } from '@/lib/seo/types';
import { rules as httpRules } from './http';
import { rules as redirectsRules } from './redirects';
import { rules as internalLinksRules } from './internal-links';
import { rules as metadataRules } from './metadata';
import { rules as contentRules } from './content';
import { rules as canonicalizationRules } from './canonicalization';
import { rules as indexabilityRules } from './indexability';
import { rules as sitemapsRules } from './sitemaps';
import { rules as robotsRules } from './robots';
import { rules as securityRules } from './security';
import { rules as structuredDataRules } from './structured-data';

export const allSeoRules: SeoRule[] = [
  ...httpRules,
  ...redirectsRules,
  ...internalLinksRules,
  ...metadataRules,
  ...contentRules,
  ...canonicalizationRules,
  ...indexabilityRules,
  ...sitemapsRules,
  ...robotsRules,
  ...securityRules,
  ...structuredDataRules,
];

const seenIds = new Set<string>();
for (const rule of allSeoRules) {
  if (seenIds.has(rule.id)) {
    throw new Error(`Duplicate SEO rule id: "${rule.id}"`);
  }
  seenIds.add(rule.id);
}

export const ruleById: Map<string, SeoRule> = new Map(allSeoRules.map(r => [r.id, r]));

// Runs every rule over one completed crawl's context. A rule throwing must
// never take down the whole audit — one bad rule shouldn't hide every other
// finding for the tenant, so we log and skip instead of propagating.
export function runRules(ctx: SeoRunContext, rules: SeoRule[] = allSeoRules): SeoIssueDraft[] {
  const issues: SeoIssueDraft[] = [];
  for (const rule of rules) {
    try {
      const found = rule.evaluate(ctx);
      if (found?.length) issues.push(...found);
    } catch (err) {
      console.error(`[seo/rules] rule "${rule.id}" threw during evaluate(); skipping it for this run`, err);
    }
  }
  return issues;
}

const SEVERITY_WEIGHT: Record<SeoSeverity, number> = {
  critical: 3,
  warning: 1,
  notice: 0.25,
};

// v1 heuristic, not a validated scoring model — revisit once we have real
// audits to calibrate against. Weighs issues by severity, compares the
// total against a per-page budget of 2 weight points, and turns that ratio
// into a 0-100 score (100 = no weighted issues, 0 = at or past budget).
export function computeHealthScore(
  pageCount: number,
  issues: { severity: SeoSeverity }[] | { ruleId: string }[],
): number {
  let totalWeight = 0;
  for (const issue of issues) {
    const severity = 'severity' in issue ? issue.severity : ruleById.get(issue.ruleId)?.severity;
    if (!severity) continue;
    totalWeight += SEVERITY_WEIGHT[severity];
  }
  const budget = Math.max(1, pageCount) * 2;
  const score = Math.round(100 * (1 - Math.min(1, totalWeight / budget)));
  return Math.min(100, Math.max(0, score));
}
