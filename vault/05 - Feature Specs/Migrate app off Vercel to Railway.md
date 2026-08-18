---
type: feature-spec
domain: sites-hosting
status: proposed
date: 2026-07-02
sources:
  - lib/vercel.ts
  - lib/website-provisioner.ts
  - lib/cloudflare-dns.ts
  - app/api/portal/websites/[siteId]/domain/route.ts
  - app/api/portal/websites/[siteId]/domains/route.ts
  - app/api/portal/websites/[siteId]/provision/route.ts
  - app/api/portal/websites/[siteId]/deployments/route.ts
  - middleware.ts
  - next.config.ts
  - vercel.json
  - .railway/railway.ts
  - railway.json
  - nixpacks.toml
  - lib/cron-auth.ts
  - lib/db/schema/sites.ts
related:
  - "[[Sites, Hosting & Publishing]]"
  - "[[Chat, Realtime & Voice]]"
  - "[[ADR realtime-yjs-standalone-railway-service]]"
---

# Feature Spec: Migrate the main app off Vercel onto Railway

## Status

**Proposed — deferred.** Reconcile-to-prod was unblocked separately via Vercel **Enhanced Builds** (see Decision log). This migration is a deliberate future project, not started. Reminder set for the week of 2026-07-06.

## Why this came up

Deploying the reconciled `main` (dev feature line merged in, PR #26) to Vercel **failed with an OOM** (`next build` SIGKILL) on Vercel's 4-core / **8 GB** build machine. The app has grown to the 8 GB build ceiling; the reconcile tipped it over. That prompted the question "should we just host on Railway?" — where build RAM is scalable and where Postgres / realtime / agents already live.

**Key finding: this is not a greenfield migration — it is ~80% scaffolded already.** `.railway/railway.ts` (IaC defining an `app` service), `railway.json`, `nixpacks.toml`, `docker-compose.yml`, `/api/health`, `middleware.ts` already forced to Node runtime with a Railway-compat comment, `AUTH_TRUST_HOST=true`, and `website-provisioner.ts` already carries a `RAILWAY_PUBLIC_DOMAIN` shared-hosting fallback branch.

## Vercel coupling map (what actually breaks)

| # | Area | Risk | Notes |
|---|---|---|---|
| 1 | **Multi-tenant domain + TLS** | **HIGH** | The whole ballgame — see below. `lib/vercel.ts`, `website-provisioner.ts`, 6 `domain(s)` API routes, `cloudflare-dns.ts`. |
| 2 | Vercel SDK / tokens | LOW | **No `@vercel/*` packages.** All Vercel usage is raw `fetch` behind `lib/vercel.ts` (`VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`). Plus `VERCEL_ENV` gates cookie domain in `lib/auth.ts:138`; `VERCEL_GIT_COMMIT_REF==='dev'` relaxes lint in `next.config.ts`. |
| 3 | Edge runtime | LOW | **None.** Zero `runtime = 'edge'`. `middleware.ts` is explicitly `runtime = 'nodejs'`. Already Railway-clean. |
| 4 | Middleware | LOW–MED | Portable (standard `x-forwarded-for`, no `req.geo`/`req.ip`). But it IS the shared-hosting tenant router (unknown Host → `/sites/[domain]`), so its correctness is entangled with #1. |
| 5 | ISR / caching | LOW | Tenant sites are `force-dynamic`. Real `revalidate` only on skills-bundle routes. `revalidateTag`/`unstable_cache` are Next primitives (work on Node), but become **process-local** off Vercel — audit if running >1 replica. |
| 6 | Image optimization | LOW | Default Node `next/image` loader, no Vercel loader. Works. Most media already proxied via `/api/media/proxy`. |
| 7 | Cron | MED | **40 Vercel Cron jobs** in `vercel.json`. But `lib/cron-auth.ts` already accepts `Bearer $CRON_SECRET`, so any external scheduler works with **zero code change** — just need a dispatcher (Railway has no per-route cron). |
| 8 | vercel.json / .vercel | LOW | `vercel.json` = framework/build/install/regions + the 40 crons. No rewrites/headers/functions (those are in `next.config.ts`). Delete on cutover. |
| 9 | Other (Blob/KV/OG/Analytics) | LOW | **None found.** Storage already S3 (`@aws-sdk/client-s3`). Sentry is platform-agnostic. |

## The one hard blocker: dynamic multi-tenant domain + TLS

Vercel natively provides **self-serve custom domains with automatic certs** on both `*.simplerdevelopment.com` subdomains and arbitrary customer-owned domains. Railway does not replicate this 1:1. Two hosting models to handle:

1. **Shared hosting** — tenant content in Postgres; `middleware.ts` rewrites unknown Host → `/sites/[domain]`. Custom domains attach to one "platform" Vercel project for TLS termination. **Easier half.**
2. **Dedicated hosting** — `createProject`/`createDeployment` spins up a *separate GitHub-repo-backed Vercel project per client* (from `website-starter`). **No Railway analog** — rebuild against Railway's API, or (recommended) **sunset in favor of shared hosting**. Open product decision; needs a count of dedicated vs shared tenants.
3. Hardcoded Vercel DNS targets (`76.76.21.21`, `cname.vercel-dns.com`) in 6+ places (incl. `CustomDomainForm.tsx`); `cloudflare-dns.ts` uses `proxied: false` explicitly "to let Vercel handle SSL". `sites` schema has `vercelProjectId`/`vercelDomain` columns.
4. Wildcard certs today rely on Vercel **lazy per-subdomain provisioning** — `next.config.ts` HSTS comment deliberately omits `includeSubDomains`/`preload` so a not-yet-provisioned tenant isn't bricked. Any replacement must preserve this safety property.

### Recommended solution: Cloudflare for SaaS

DNS is **already on Cloudflare** (`lib/cloudflare-dns.ts`). [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/) is purpose-built for multi-tenant custom domains with automatic TLS at scale, proxying to a Railway origin. Migration = replace `lib/vercel.ts` domain functions with Cloudflare custom-hostname API calls + repoint the hardcoded DNS targets. Collapses the HIGH-risk blocker into a bounded integration. (Alternatives considered: Caddy on-demand TLS in front of Railway — self-managed, no per-domain cost, but you run Caddy; Railway custom-domains API scripted per tenant — Railway isn't designed as a multi-tenant-domain platform.)

## Phased plan & rough effort

| Phase | Work | Effort |
|---|---|---|
| 1. App on Railway | Run the `app` service (IaC exists), migrate all Vercel env, wire `/api/health` | ~1–2 days |
| 2. Cron | External scheduler hitting the 40 routes with `Bearer $CRON_SECRET`; drop `vercel.json` crons | ~0.5–1 day |
| 3. **Domain/TLS (the crux)** | Cloudflare-for-SaaS integration replacing `lib/vercel.ts`; repoint DNS targets; decide dedicated-hosting fate; preserve lazy-cert safety | **~1–2 weeks** |
| 4. Cutover | Zero-downtime DNS flip (apex + live tenant sites), Vercel as rollback, monitoring | ~2–3 days |

**Total ≈ 2–3 weeks**, dominated by Phase 3 and the live-tenant cutover (real client domains — cannot break them).

## Cost comparison (why cost is NOT the driver)

- **Vercel Enhanced Builds** (the OOM fix): 8-CPU machine at **$0.028/min → ~$0.14 per ~5-min build**. Marginal, not a subscription.
- **Railway app runtime**: $20/vCPU/mo + $10/GB-RAM/mo (usage-based). A 1 vCPU / 2 GB always-on Next app ≈ **$40–50/mo**.
- Raw compute is roughly a wash. The dominant cost of leaving Vercel is the **domain/TLS migration + cutover effort**, not the monthly bill. Migrate only for strategic reasons (one-platform consolidation, control, Vercel bandwidth costs at scale) — not to dodge an OOM.

## Decision log

- **2026-07-02** — Chose **Enhanced Builds** to unblock the reconcile deploy immediately (cents/build, no migration, preserves the Vercel tenant-domain/TLS model). Railway migration **deferred** to a deliberate project. Reminder set for week of 2026-07-06.

## Open questions before committing

1. How many tenants use **dedicated** hosting vs shared? (Determines whether dedicated hosting can be sunset.)
2. Cloudflare for SaaS custom-hostname limits/pricing at the expected tenant count.
3. Multi-replica cache correctness (`revalidateTag` is process-local off Vercel) — matters only if scaling horizontally.
4. Preview-per-PR replacement (Vercel gives it free; Railway PR environments differ).
