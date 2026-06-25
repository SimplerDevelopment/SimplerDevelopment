# Roast: Plugins & Extension — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
Plugins & Extension is SD's third-party extensibility layer — two distinct mechanisms sharing auth primitives. The **plugin system** federates independently-deployed Next.js apps inside the portal under `/portal/apps/<slug>/*` via an iframe proxy, with the portal minting short-lived (60s) HMAC-SHA256 JWTs (AES-GCM-encrypted secrets via `PORTAL_KMS_KEY`) that carry tenant identity and scopes. Plugins call back through a JTI-deduplicated, scope-gated `/api/plugin-callback/<appId>/` surface. The first and currently only production plugin is **Postcaptain Tools** (competitor-research briefs + AI blog drafts with a built-in CAS job queue and Brain ingestion pipeline). The **browser extension** (MV3, standalone Vite/React build) lets agency staff capture page context, create CRM contacts/companies, log activity, and write Brain notes from any tab — authenticated against a dedicated `/api/extension/v1/` REST surface, with AI extraction powered by Claude Haiku server-side.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS — plugin marketplace expands what they can do inside the portal without SD building every vertical; the browser extension keeps CRM/Brain capture frictionless from any web tab.
- **End user:** Agency staff browsing the web (extension), agency clients indirectly (competitor research output, Brain-ingested content informs their deliverables).
- **Monetization:** Plugin entitlement with `visibility: 'entitled'` gates access through `client_services` → `billingServiceId` (a Stripe product gate) — so premium plugins are paid add-ons. The extension is currently a free companion. Browser extension AI extraction consumes AI credits (Claude Haiku) per-extraction, so it participates in AI-credit metered revenue. A plugin marketplace at scale would be a revenue-share or SaaS-on-SaaS model.

## The edge
- **Zero build-time coupling.** Iframe + JWT proxy means plugins deploy independently — no module federation build complexity, no monorepo entanglement. A plugin author ships a Next.js app anywhere; SD wraps it with auth, nav, and billing without touching plugin code.
- **CAS-based job queue inside Postgres.** The plugin run scheduler uses Compare-And-Swap against `registered_app_runs.status` for concurrency safety across serverless instances — no Redis, no SQS, no external queue infra. For a tiny team that already runs Postgres, this is a genuine operational simplicity win.
- **Brain-integrated extension.** The browser extension's AI extraction (`lib/extension/extract.ts`, Claude Haiku) resolves extracted entities against the tenant's Company Brain and CRM before surfacing results — not just a scraper, but a context-aware capture tool tied to the agency's knowledge graph.
- **JTI replay dedup as a DB invariant.** `registered_app_callbacks_audit.jti` has a `UNIQUE` constraint — replay attacks are blocked at the INSERT level, not by application logic. This is a correct-by-construction security guarantee.
- **Scope superset gate on manifest.** A plugin cannot escalate privileges by listing extra scopes in its `sd-manifest.json` — the portal rejects manifests that claim scopes beyond `registered_apps.defaultScopes`. Privilege escalation is structurally prevented, not just documented.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: WordPress plugin ecosystem (10,000+ plugins, massive dev community), Shopify App Store (purpose-built marketplace with billing rails), Zapier app directory (no-code integrations), HubSpot App Marketplace (CRM-native ecosystem).
- Time-to-first-dollar and maintainability by a tiny team both matter.
- Known gaps and hard constraints: **one production plugin exists** (Postcaptain Tools) — this is a federation architecture with a population of one. Microsoft BYO-app credential parity on the plugin side is unplanned. The browser extension is excluded from the main `tsconfig.json` (separate build, separate deployment) — any cross-cutting change requires two parallel maintenance tracks. Plugin cron workers run every minute but use Vercel cron (minimum 1-minute resolution) — latency-sensitive job types are not well-served. The extension has no offline mode and no sync queue; missed captures are lost.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That agencies and third-party developers will build plugins for an ecosystem with one current tenant (Postcaptain Tools) and no public marketplace, when WordPress has 10,000+ plugins, Shopify has billing-integrated app rails, and Zapier requires zero-code — i.e., that the plugin federation architecture will attract external supply before SD has enough installed base to make it worth a plugin developer's time.
