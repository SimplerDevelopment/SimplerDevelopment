// Shared shapes for the SEO Intelligence portal UI — mirrors the API
// contract in app/api/portal/seo/** by hand (small, stable surface; not
// generated). Keep in sync if a route's response shape changes.

export type SeoRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface SeoProjectSettings {
  includePatterns?: string[];
  excludePatterns?: string[];
  ignoreQueryParams?: boolean;
}

/** Slim run projection embedded on each project row in GET /seo/projects. */
export interface SeoLatestRun {
  id: number;
  status: SeoRunStatus;
  healthScore: number | null;
  pagesCrawled: number;
  criticalCount: number;
  warningCount: number;
  noticeCount: number;
  finishedAt: string | null;
  createdAt: string;
}

export interface SeoProjectListItem {
  id: number;
  name: string;
  domain: string;
  startUrl: string;
  websiteId: number | null;
  maxPages: number;
  maxDepth: number;
  settings: SeoProjectSettings;
  active: boolean;
  createdAt: string;
  latestRun: SeoLatestRun | null;
}

export interface SeoRunStats {
  statusCodes?: Record<string, number>;
  depthDistribution?: Record<string, number>;
  indexable?: number;
  nonIndexable?: number;
  issuesByCategory?: Record<string, number>;
}

/** Full run row — from GET /seo/runs/[id] and embedded in project detail's `runs`. */
export interface SeoRun {
  id: number;
  projectId?: number;
  status: SeoRunStatus;
  pagesCrawled: number;
  healthScore: number | null;
  criticalCount: number;
  warningCount: number;
  noticeCount: number;
  stats: SeoRunStats;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface SeoProjectDetail {
  id: number;
  clientId: number;
  websiteId: number | null;
  name: string;
  domain: string;
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  settings: SeoProjectSettings;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  runs: SeoRun[];
}

export interface SeoIssuePage {
  id: number | null;
  url: string | null;
  details: Record<string, unknown>;
}

export interface SeoIssueGroup {
  ruleId: string;
  category: string;
  severity: 'critical' | 'warning' | 'notice';
  title: string;
  description: string;
  whyItMatters: string;
  howToFix: string;
  count: number;
  pages: SeoIssuePage[];
}

export interface SeoCrawlPageRow {
  id: number;
  url: string;
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  indexable: boolean | null;
  indexabilityReason: string | null;
  depth: number;
  discoveredFrom: string;
  wordCount: number;
  internalLinksCount: number;
  externalLinksCount: number;
  imagesMissingAlt: number;
  responseTimeMs: number | null;
  internalRank: number | null;
  incomingLinks: number;
  orphan: boolean;
}

/** Just the fields the "link to hosted website" select needs. */
export interface WebsiteOption {
  id: number;
  name: string;
}

// ── Search Performance (Google Search Console) ──────────────────────────────
// Mirrors GET /api/portal/seo/projects/[id]/search-performance.

export interface GscOverviewPoint {
  date: string;
  clicks: number;
  impressions: number;
}

export interface GscOverview {
  series: GscOverviewPoint[];
  totals: {
    clicks: number;
    impressions: number;
    avgCtr: number;
    avgPosition: number;
  };
}

export interface QueryDelta {
  query: string;
  clicks: number;
  prevClicks: number;
  deltaClicks: number;
  position: number;
  prevPosition: number;
}

export interface QueryStat {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PageDelta {
  page: string;
  clicks: number;
  prevClicks: number;
  deltaClicks: number;
  declinePct: number;
}

export interface SearchPerformanceReports {
  winners: QueryDelta[];
  losers: QueryDelta[];
  newQueries: QueryStat[];
  lostQueries: QueryStat[];
  ctrOpportunities: QueryStat[];
  strikingDistance: QueryStat[];
  pageDecay: PageDelta[];
}

export interface SearchPerformanceData {
  /** false → project not linked to a hosted site with GSC connected. */
  connected: boolean;
  /** The GSC property, when connected. */
  siteUrl: string | null;
  /** Newest imported day ('YYYY-MM-DD'), null when no data yet. */
  lastDate: string | null;
  overview: GscOverview | null;
  reports: SearchPerformanceReports | null;
}

/** Mirrors GscImportResult in lib/seo/gsc.ts — the POST /gsc-import response. */
export type GscImportResult =
  | { imported: { queries: number; pages: number } }
  | { skipped: 'not-linked' | 'not-connected' | 'up-to-date' };
