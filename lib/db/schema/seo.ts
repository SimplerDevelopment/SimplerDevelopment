// SEO Intelligence — per-tenant site audits over first-party data.
//
// A `seo_projects` row targets ONE domain per client: either a hosted
// `client_websites` site (websiteId set, auto-suggested in the UI) or any
// external domain the tenant adds (websiteId null — pre-migration prospect
// audits are a sales tool, so external domains are first-class, not an edge
// case). Crawl execution follows the registered_app_runs pattern:
// `seo_crawl_runs` doubles as the work queue — rows start 'queued', the
// drain cron CAS-claims to 'running', and the crawler processes a bounded
// chunk of pages per tick so a run survives serverless function timeouts.
// The crawl frontier lives in `seo_crawl_runs.state` (jsonb), not a separate
// table — bounded by maxPages so it stays small.
// ponytail: jsonb frontier caps out around a few thousand pages/run; move to
// a dedicated frontier table if maxPages ever grows past that.
//
// Analytics posture: plain Postgres + per-run rows, NO ClickHouse — the
// house pattern (cf. mcp_tool_call_daily_rollups) is event tables + rollups,
// and audit volume is bounded by maxPages × run frequency. High-volume
// tables (pages, links, issues) use bigserial like the audit tables.
//
// Tenancy: clientId is denormalized onto every table here (not just
// projects) so queries can filter without joins and the tenancy suite can
// assert scoping per-table.

import {
  pgTable,
  serial,
  bigserial,
  bigint,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients, clientWebsites } from './sites';

// ─── seo_projects ───────────────────────────────────────────────────────────
// One audited domain per row. `domain` is the canonical host ("example.com");
// `startUrl` seeds the crawl (usually "https://example.com/").

export type SeoProjectSettings = {
  includePatterns?: string[]; // substring/glob paths to keep (empty = all)
  excludePatterns?: string[]; // paths to skip
  ignoreQueryParams?: boolean; // strip ?query during URL normalization
};

export const seoProjects = pgTable('seo_projects', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Hosted-site link. set-null (not cascade): deleting a hosted website must
  // not silently destroy the audit history of the domain it served.
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull(),
  startUrl: varchar('start_url', { length: 500 }).notNull(),
  // Crawl caps are first-class columns (not settings jsonb) because the 'seo'
  // billing meter counts crawled URLs — quota enforcement reads these.
  maxPages: integer('max_pages').default(200).notNull(),
  maxDepth: integer('max_depth').default(5).notNull(),
  settings: jsonb('settings').$type<SeoProjectSettings>().default({}).notNull(),
  active: boolean('active').default(true).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('seo_projects_client_idx').on(t.clientId),
  uniqueIndex('seo_projects_client_domain_uq').on(t.clientId, t.domain),
]);

// ─── seo_crawl_runs ─────────────────────────────────────────────────────────
// Execution log + work queue (registered_app_runs pattern). The drain cron
// CAS-claims queued rows; `heartbeatAt` is the lease — a 'running' row whose
// heartbeat is stale gets re-claimed, so a crashed tick can't strand a run.
// Claim/lease columns are timestamptz per the lib/db rule (exact-match CAS
// needs correct UTC round-trips regardless of PG session timezone).

export type SeoCrawlRunState = {
  // Frontier: URLs discovered but not yet fetched, with their depth and how
  // they were discovered (persisted mid-run, so provenance must survive the
  // round-trip — seo_crawl_pages.discovered_from is written from it).
  frontier?: { url: string; depth: number; from: 'seed' | 'link' | 'sitemap' | 'redirect' }[];
  // Normalized URLs already fetched or queued this run (dedup set).
  seen?: string[];
  // Sitemap URLs found, kept for sitemap-vs-crawl rules.
  sitemapUrls?: string[];
  robotsTxt?: string | null;
};

export type SeoCrawlRunStats = {
  statusCodes?: Record<string, number>; // '200' -> 143
  depthDistribution?: Record<string, number>; // '0' -> 1, '1' -> 12
  indexable?: number;
  nonIndexable?: number;
  issuesByCategory?: Record<string, number>;
};

export const seoCrawlRuns = pgTable('seo_crawl_runs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => seoProjects.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).default('queued').notNull(), // 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  pagesCrawled: integer('pages_crawled').default(0).notNull(),
  state: jsonb('state').$type<SeoCrawlRunState>().default({}).notNull(),
  // 0-100, computed by the rules engine at run completion; null while running.
  healthScore: integer('health_score'),
  criticalCount: integer('critical_count').default(0).notNull(),
  warningCount: integer('warning_count').default(0).notNull(),
  noticeCount: integer('notice_count').default(0).notNull(),
  stats: jsonb('stats').$type<SeoCrawlRunStats>().default({}).notNull(),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  requestedBy: integer('requested_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('seo_crawl_runs_project_idx').on(t.projectId),
  index('seo_crawl_runs_client_idx').on(t.clientId),
  index('seo_crawl_runs_status_idx').on(t.status),
]);

// ─── seo_crawl_pages ────────────────────────────────────────────────────────
// One row per fetched URL per run. First-class columns are only what rules
// and the Pages table sort/filter on; long-tail extraction (headings sample,
// OG/Twitter presence, JSON-LD types, hreflang) lives in `meta` jsonb.
// `urlHash` is sha256(normalized url) — 2 KB urls make btree-indexing the raw
// column both slow and size-risky, so uniqueness and joins go through the hash.

export type SeoPageMeta = {
  h2?: string[]; // first few, for context in the UI
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  twitterCard?: string | null;
  jsonLdTypes?: string[];
  hreflang?: { lang: string; href: string }[];
  robotsMeta?: string | null;
  headers?: Record<string, string>; // response headers the rules care about
  iframeCount?: number;
  canonicalCount?: number; // number of rel=canonical link tags found
  metaRefresh?: boolean; // <meta http-equiv="refresh"> present
  insecureResourceCount?: number; // http:// subresources on an https page
  jsonLdParseErrors?: number; // JSON-LD <script> blocks that failed to parse
};

export const seoCrawlPages = pgTable('seo_crawl_pages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  runId: integer('run_id').notNull().references(() => seoCrawlRuns.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => seoProjects.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 2048 }).notNull(), // normalized
  urlHash: varchar('url_hash', { length: 64 }).notNull(),
  httpStatus: integer('http_status'),
  finalUrl: varchar('final_url', { length: 2048 }), // after redirects, when different
  redirectChain: jsonb('redirect_chain').$type<string[]>().default([]).notNull(),
  contentType: varchar('content_type', { length: 128 }),
  responseTimeMs: integer('response_time_ms'),
  responseBytes: integer('response_bytes'),
  depth: integer('depth').default(0).notNull(),
  discoveredFrom: varchar('discovered_from', { length: 16 }).default('link').notNull(), // 'seed' | 'link' | 'sitemap' | 'redirect'
  indexable: boolean('indexable'),
  indexabilityReason: varchar('indexability_reason', { length: 64 }), // 'noindex-meta' | 'robots-blocked' | 'canonical-elsewhere' | 'error-status' | ...
  canonicalUrl: varchar('canonical_url', { length: 2048 }),
  title: text('title'),
  metaDescription: text('meta_description'),
  h1: text('h1'),
  h1Count: integer('h1_count').default(0).notNull(),
  wordCount: integer('word_count').default(0).notNull(),
  lang: varchar('lang', { length: 16 }),
  contentHash: varchar('content_hash', { length: 64 }), // text-content hash for duplicate detection
  internalLinksCount: integer('internal_links_count').default(0).notNull(),
  externalLinksCount: integer('external_links_count').default(0).notNull(),
  nofollowLinksCount: integer('nofollow_links_count').default(0).notNull(),
  imagesCount: integer('images_count').default(0).notNull(),
  imagesMissingAlt: integer('images_missing_alt').default(0).notNull(),
  meta: jsonb('meta').$type<SeoPageMeta>().default({}).notNull(),
  // Link-graph metrics, backfilled by the PageRank pass at run completion.
  internalRank: real('internal_rank'),
  incomingLinks: integer('incoming_links').default(0).notNull(),
  orphan: boolean('orphan').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('seo_crawl_pages_run_url_uq').on(t.runId, t.urlHash),
  index('seo_crawl_pages_project_idx').on(t.projectId),
  index('seo_crawl_pages_client_idx').on(t.clientId),
]);

// ─── seo_page_links ─────────────────────────────────────────────────────────
// Directed edges of the internal link graph for one run. `toPageId` is
// resolved after the crawl (the target may 404 or sit outside the crawl
// budget, so edges keep the raw target url + hash). External links are
// persisted too (isInternal=false) for broken-external-link rules, but only
// internal edges feed PageRank.

export const seoPageLinks = pgTable('seo_page_links', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  runId: integer('run_id').notNull().references(() => seoCrawlRuns.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  fromPageId: bigint('from_page_id', { mode: 'number' }).notNull().references(() => seoCrawlPages.id, { onDelete: 'cascade' }),
  toUrl: varchar('to_url', { length: 2048 }).notNull(),
  toUrlHash: varchar('to_url_hash', { length: 64 }).notNull(),
  toPageId: bigint('to_page_id', { mode: 'number' }),
  anchorText: varchar('anchor_text', { length: 512 }),
  isInternal: boolean('is_internal').default(true).notNull(),
  nofollow: boolean('nofollow').default(false).notNull(),
}, (t) => [
  index('seo_page_links_run_idx').on(t.runId),
  index('seo_page_links_from_idx').on(t.fromPageId),
  index('seo_page_links_run_to_hash_idx').on(t.runId, t.toUrlHash),
]);

// ─── seo_issues ─────────────────────────────────────────────────────────────
// Rule-engine findings. category/severity are denormalized from the rule
// definition so the Issues tab can filter without loading the rule registry.
// pageId is null for site-level issues (e.g. "sitemap contains non-indexable
// URL" attaches evidence in details instead).

export const seoIssues = pgTable('seo_issues', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  runId: integer('run_id').notNull().references(() => seoCrawlRuns.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => seoProjects.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  pageId: bigint('page_id', { mode: 'number' }),
  ruleId: varchar('rule_id', { length: 64 }).notNull(),
  category: varchar('category', { length: 32 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(), // 'critical' | 'warning' | 'notice'
  details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('seo_issues_run_idx').on(t.runId),
  index('seo_issues_run_rule_idx').on(t.runId, t.ruleId),
  index('seo_issues_client_idx').on(t.clientId),
]);

// ─── seo_recommendations ────────────────────────────────────────────────────
// AI-generated, on-demand only (a real Claude call per generation — the
// tenant triggers it; nothing generates in the background). Persisted so the
// list survives between generations and items can be worked/dismissed.
// opportunityScore = impact × confidence ÷ effort, computed at generation.

export type SeoRecommendationEvidence = {
  ruleIds?: string[];
  urls?: string[];
  metrics?: Record<string, number | string>;
  summary?: string;
};

export const seoRecommendations = pgTable('seo_recommendations', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => seoProjects.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  runId: integer('run_id').references(() => seoCrawlRuns.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(), // markdown: the suggested action + reasoning
  impact: varchar('impact', { length: 16 }).notNull(), // 'high' | 'medium' | 'low'
  effort: varchar('effort', { length: 16 }).notNull(), // 'high' | 'medium' | 'low'
  confidence: real('confidence').notNull(), // 0..1
  opportunityScore: real('opportunity_score').notNull(),
  evidence: jsonb('evidence').$type<SeoRecommendationEvidence>().default({}).notNull(),
  status: varchar('status', { length: 16 }).default('open').notNull(), // 'open' | 'done' | 'dismissed'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('seo_recommendations_project_idx').on(t.projectId),
  index('seo_recommendations_client_idx').on(t.clientId),
]);

// ─── Inferred types ─────────────────────────────────────────────────────────

export type SeoProject = typeof seoProjects.$inferSelect;
export type NewSeoProject = typeof seoProjects.$inferInsert;

export type SeoCrawlRun = typeof seoCrawlRuns.$inferSelect;
export type NewSeoCrawlRun = typeof seoCrawlRuns.$inferInsert;

export type SeoCrawlPage = typeof seoCrawlPages.$inferSelect;
export type NewSeoCrawlPage = typeof seoCrawlPages.$inferInsert;

export type SeoPageLink = typeof seoPageLinks.$inferSelect;
export type NewSeoPageLink = typeof seoPageLinks.$inferInsert;

export type SeoIssue = typeof seoIssues.$inferSelect;
export type NewSeoIssue = typeof seoIssues.$inferInsert;

export type SeoRecommendation = typeof seoRecommendations.$inferSelect;
export type NewSeoRecommendation = typeof seoRecommendations.$inferInsert;
