// SEO Intelligence — shared contracts between the crawler, extraction
// engine, rules engine, and PageRank pass. The DB row types from
// lib/db/schema/seo.ts are the single source of truth for page shape; these
// types derive from them rather than duplicating a parallel hierarchy.

import type { NewSeoCrawlPage, SeoCrawlPage, SeoPageLink } from '@/lib/db/schema';

// What the extraction engine produces for one fetched URL — everything the
// page row needs except run/tenant identity (the crawler owns those) and the
// link-graph metrics (the PageRank pass backfills those at run completion).
export type PageExtract = Omit<
  NewSeoCrawlPage,
  'id' | 'runId' | 'projectId' | 'clientId' | 'createdAt' | 'internalRank' | 'incomingLinks' | 'orphan'
>;

export type ExtractedLink = {
  href: string; // absolute, normalized
  anchorText: string | null;
  nofollow: boolean;
  isInternal: boolean;
};

export type ExtractResult = {
  page: PageExtract;
  links: ExtractedLink[];
};

export type SeoSeverity = 'critical' | 'warning' | 'notice';

export type SeoCategory =
  | 'crawlability'
  | 'indexability'
  | 'http'
  | 'redirects'
  | 'canonicalization'
  | 'metadata'
  | 'content'
  | 'internal-links'
  | 'external-links'
  | 'images'
  | 'structured-data'
  | 'international'
  | 'sitemaps'
  | 'robots'
  | 'security';

// A finding before persistence. pageUrl (normalized) is resolved to a
// seo_crawl_pages.id by the runner; site-level issues omit it and carry
// their evidence in details.
export type SeoIssueDraft = {
  ruleId: string;
  pageUrl?: string;
  details?: Record<string, unknown>;
};

// Everything a rule may inspect. Rules run once per completed crawl over the
// persisted rows — uniform run-scope keeps the engine to a single loop; a
// per-page rule simply iterates ctx.pages.
export type SeoRunContext = {
  baseUrl: string; // normalized origin of the audited site, e.g. "https://example.com"
  pages: SeoCrawlPage[];
  links: SeoPageLink[];
  sitemapUrls: string[]; // URLs listed in the site's sitemap(s)
  robotsTxt: string | null;
};

// Declarative rule. The prose fields ship to the UI verbatim (description /
// why-it-matters / how-to-fix are the deterministic, no-AI explanations the
// Issues tab renders), so write them for the site owner, not the developer.
export type SeoRule = {
  id: string; // kebab-case, stable forever (persisted on issues)
  category: SeoCategory;
  severity: SeoSeverity;
  title: string;
  description: string;
  whyItMatters: string;
  howToFix: string;
  evaluate(ctx: SeoRunContext): SeoIssueDraft[];
};
