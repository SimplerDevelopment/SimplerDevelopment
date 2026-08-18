# ADR: SEO Intelligence folded into the platform, not built as the standalone plan

**Date:** 2026-08-12
**Status:** Accepted (Stage 1 shipped in PR #49; project 211 tracks the rest)
**Context:** An external "SEO Intelligence Platform — Claude Code Build Plan" PDF specified a greenfield Ahrefs-style SaaS: its own monorepo, orgs/auth/Stripe, ClickHouse for analytics, Redis/BullMQ for queues, DataForSEO for SERP/keyword/backlink data, and a 20-phase build. The operator asked for it to be folded into SimplerDevelopment's website features instead.

## Decision

Build it as the platform's 13th feature domain (`seo`), per-tenant, reusing existing seams. The PDF's *workflows* were kept; its *infrastructure* was systematically replaced:

| Plan said | We did | Why |
|---|---|---|
| New monorepo + own auth/orgs/billing | Portal module + `FEATURE_DOMAINS['seo']` | ~half its Milestone 1 already existed here |
| ClickHouse for history | Postgres event tables + rollups (`seo_gsc_*_daily`, per-run rows) | House pattern; volume is bounded by crawl caps (200 pages/run default) |
| Redis + BullMQ | `seo_crawl_runs` doubles as a CAS-claim queue + per-minute Vercel cron, stale-heartbeat lease, jsonb frontier state | House pattern (registered_app_runs); handlers queue-agnostic so they can migrate to `internal_jobs` (landed on main the same day via PR #46) |
| DataForSEO from day one | First-party wedge only (crawler + rules + GSC + AI recs); Serp/Keyword/Backlink provider interfaces stubbed | Zero external spend until a provider account decision is made; interfaces keep the swap cheap |
| Playwright rendering when needed | HTTP-only fetch, `node-html-parser` | The plan itself warns against Playwright-per-page; nothing we audit today needs JS rendering |
| Own keyword difficulty score | Deferred with the provider features | Needs SERP data we don't buy yet |

Other rejected alternatives:
- **Hosted-sites-only crawling** — rejected; external domains are first-class (`seo_projects.websiteId` nullable) because pre-migration prospect audits are a sales tool.
- **Fold into the `websites` billing module** — rejected; separate `seo` domain so it can be sold independently. Pricing provisional (no Stripe IDs) until crawl+AI cost is measured, per the plan's own rule.
- **Auto AI recommendations per crawl / weekly cron** — rejected for on-demand-only generation; background AI spend across tenants is unbounded, tenant-triggered spend is self-limiting.
- **13-module volume tier at 46%** (not repricing the 12-module tier) — preserves the OBQA-016 bundle-ceiling invariant without moving any existing subscriber's price.

## Consequences

- GSC insights only work for projects linked to a hosted website (the per-website Google OAuth already carried the `webmasters` scope, so no re-auth was needed — but external-domain projects get an empty state, not data).
- The crawler is an intentional SSRF primitive; every fetch (including each redirect hop) goes through `lib/ssrf-guard.ts`, and registration runs the static screen. Any future fetch path added to `lib/seo/` must keep this.
- Schema went out via the additive prod-schema-sync (no migration files); the export-parity snapshot test now records 309/311 tables and must be regenerated with any schema addition.
- Stage 2 (GSC) and Stage 3 (AI recs, provider stubs, MCP tools) land as separate PRs off the same worktree.
