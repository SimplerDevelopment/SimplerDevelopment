# Roast V2: Browser Extension + Internal Plugin Primitives — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

Two mechanisms, two mandates — deliberately split:

**Browser extension (first-class paid/retention feature).** MV3, Vite/React build — agency staff capture page context, create CRM contacts/companies, log activity, and write Brain notes from any tab against `/api/extension/v1/`. AI extraction via Claude Haiku resolves entities against the tenant's Company Brain and CRM before surfacing results. This is not a scraper; it is the only capture surface an agency has outside the portal. It is being positioned and priced as a first-class paid seat-level feature (or hard retention gate), not a free companion.

**Plugin system (internal-only extensibility primitive).** An iframe-proxy federation layer that wraps independently-deployed Next.js apps under `/portal/apps/<slug>/*` with HMAC-SHA256 JWTs (60s TTL, AES-GCM-encrypted secrets), a JTI-deduplicated callback surface, and a scope-superset gate that prevents privilege escalation. The current and near-term use is exclusively internal Stripe-gated plugins — Postcaptain Tools today; competitor-research, rank-tracking, and review-management modules next. There is no external-developer program, no public marketplace, and no revenue-share rails. Those do not exist and are not on the roadmap until 50+ paying agencies make plugin-developer economics legible.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS who need frictionless CRM/Brain capture from any tab and who benefit from an expanding menu of Stripe-gated internal tools without SD building a full vertical for each one.
- **End user:** Agency staff browsing the web (extension); agency principals consuming competitor-research and AI-drafted content from internal plugin outputs.
- **Monetization (current plan):**
  - Extension: paid add-on per seat or hard-gated on Growth/Scale plans — the goal is for each agency's extension usage to become visible in retention data.
  - Internal plugins: each plugin (Postcaptain model) carries its own `visibility: 'entitled'` gate against `client_services → billingServiceId` — Stripe-gated add-ons, not a marketplace.
  - AI credits: each browser-extension extraction burns Claude Haiku credits, participating in metered revenue.
  - No revenue-share play, no plugin-developer economics, no marketplace billing rails — these are parked until installed base earns them.

## The edge

**Brain-resolution hit rate on capture.** The browser extension's AI extraction resolves contacts, companies, and topics against the tenant's live Company Brain and CRM before surfacing results. If the Brain is populated, captures land in context rather than as orphan records. This is the load-bearing claim — and it is explicitly conditional: the edge only materializes on tenants who have invested in Brain hygiene. That condition is the riskiest assumption below.

**Client-data-protection by construction (moves to sales deck).** Three security properties are structural, not policy: (1) JTI replay dedup via a `UNIQUE` constraint on `registered_app_callbacks_audit.jti` — replay attacks blocked at INSERT level; (2) scope superset gate on `sd-manifest.json` — plugins cannot escalate privileges beyond `registered_apps.defaultScopes`; (3) AES-GCM-encrypted secrets under `PORTAL_KMS_KEY`. These no longer pitch to plugin developers (who don't exist yet); they pitch to agency buyers as "your clients' data isn't exposed by our extensibility layer."

**CAS-based job queue without external infra.** The plugin-run scheduler uses Compare-And-Swap against `registered_app_runs.status` for serverless-safe concurrency — no Redis, no SQS. For a tiny team running Postgres already, this is a genuine operational-simplicity win for internal plugin operations.

**Zero build-time coupling for internal extensibility.** Internal plugins deploy independently; SD wraps them with auth, nav, and billing without touching plugin code. This makes each new internal plugin a contained scope — the Postcaptain pattern can repeat for each new vertical add-on without touching the core monorepo.

## Constraints

- Solo founder / tiny team; SD is a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- The browser extension has a separate `tsconfig.json`, separate build, and separate deploy — any cross-cutting change requires two parallel maintenance tracks. This dual-track cost is the primary maintenance tax and is accepted as the cost of the extension's independence; it is not expanding (no external-plugin third track until the installed base warrants it).
- **GO-LIVE BLOCKER (real code work, not yet done):** The extension has no offline mode and no sync queue — missed captures during connectivity loss are silently dropped. This is a concrete, named buying objection: a CRM that silently loses captures is worse than no CRM. Fixing this (durable offline queue with retry-on-reconnect) is a scoped engineering job and is committed as a blocker before the extension is promoted to a paid or retention-gated tier. This is not complete; it is the first increment being closed.
- Plugin cron workers run on Vercel cron at minimum 1-minute resolution — latency-sensitive plugin job types are not well-served and the plugin roadmap should reflect this.
- One production plugin exists (Postcaptain Tools) — the federation architecture has a population of one. Internal-only framing removes the ecosystem-chicken-and-egg pressure, but the architecture's ROI is still being earned one internal plugin at a time.
- External-developer program, marketplace documentation, and revenue-share rails are frozen and will not be built until 50+ paying agencies create visible supply-side economics. This is a firm constraint, not a hedge.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the extension's Brain-integrated capture create genuine CRM/knowledge lock-in — or is it a convenience feature agencies tolerate but wouldn't pay for? Does the internal plugin model generate enough add-on revenue to justify the ongoing dual-track maintenance cost, or does it just give a tiny team two surfaces to break on every cross-cutting change?

2. **Could it stand alone?** No standalone ambition — bundled retention layer. The extension has no moat outside Brain/CRM co-location; it is a frictionless on-ramp to SD data, not a standalone product. The plugin system's edge (zero build-time coupling + client-data-protection-by-construction) only materializes inside the SD auth and billing surface. Neither mechanism is being positioned for a standalone path.

## Riskiest assumption to pressure-test

That the browser extension's Brain-resolution hit rate is high enough, on real tenants, to justify a paid seat-level gate — i.e., that enough agencies have sufficiently populated Company Brains that extracted entities land in context rather than as orphan noise. The prior riskiest assumption (external plugin-developer supply) has been removed by demoting the marketplace; the new one is whether the extension's core value proposition is realized in practice, which is an instrumentation question answerable in 48 hours: measure captures/day/seat and Brain-resolution hit rate on current users before committing to a paid tier, and ask 5 agency users "would you pay $X/seat for this?" and "what would make you cancel?" If Brain-resolution is low, the extension is a convenience feature, not a retention primitive — and the paid framing oversells it.
