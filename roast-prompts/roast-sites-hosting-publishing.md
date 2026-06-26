# Roast: Sites, Hosting & Publishing — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment's Sites, Hosting & Publishing domain covers the full lifecycle of a per-tenant public-facing client website: subdomain and custom-domain routing via middleware (with three-step domain resolution and white-label portal domains for agencies), a public block-based renderer at `app/sites/[domain]/[[...slug]]/`, branding tokens, draft/live nav and custom CSS/JS, analytics integrations (GA4, GTM, Meta Pixel, Search Console), snapshot export/import for portability, Railway-backed managed-app hosting and Vercel-backed CMS hosting with per-environment env-var sync, and a content publishing pipeline built on top of the platform's own kanban system (campaigns, per-user stage permissions, an email dispatch channel). Sixteen MCP tools let AI agents manage sites, nav, domains, env vars, and custom code.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies who build and host client websites inside SD, wanting everything — site builder, hosting, analytics, and a publishing workflow — in one platform and one bill.
- **End user:** The agency's clients, whose public websites are rendered by this domain; agency staff who author and publish content.
- **Monetization:** Part of the SD module subscription (the "Sites" and "Hosting" SKUs in the 12-module catalog); agencies pay per-module, and hosted-app provisioning on Railway is an upsell from self-hosted CMS. Snapshot portability (import/export) could become a marketplace feature (`isPublic` field is forward-wired).

## The edge
- **Agency white-labeling is structural, not cosmetic.** Custom-domain middleware rewrites to `/portal/` for white-label agency portals, not just to the public site — so agencies deliver a fully branded CMS and publishing experience to their clients at their own domain, which competitors like Webflow don't natively do for the agency-reseller model.
- **Publishing workflow reuses platform kanban.** The Publishing Command Center is not a separate board — it's `kanban_cards`/`kanban_columns` with `system_kind='publishing'`, which means any improvements to the kanban domain (AI sprint planning, MCP tools, etc.) automatically lift the publishing workflow. No second system to maintain.
- **MCP-native site management.** All 16 site/nav/domain/env tools are callable by AI agents — meaning an agent can scaffold a new site, update nav, publish custom code, and set env vars in one conversation, which no Webflow or Framer competitor offers.
- **Snapshot portability enables agency resale workflows.** Agencies can templatize a site (blocks + posts + nav + brand settings) into a portable snapshot and re-deploy it for each new client — a real efficiency multiplier for agencies running many similar client sites.
- **Two hosting backends, one portal.** Railway (managed apps) and Vercel (CMS sites) are surfaced under one hosting UI, one billing line, and one MCP tool surface — reducing the tab-switching and credential juggling agencies deal with today.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Webflow, WordPress (+ WP Engine), Framer, Vercel (direct), Netlify.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That agencies will consolidate their client website infrastructure onto SD rather than keeping the site builder they already know (Webflow, WordPress), given that the public renderer is a custom block system with no ecosystem of third-party themes or plugins — and the full DB-lookup middleware gate (which would reject unknown hosts before any rewrite) is still deferred, leaving a known security gap that sophisticated agencies may treat as a hard blocker.
