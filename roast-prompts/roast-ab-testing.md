# Roast: AB Testing — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
Server-side split testing for public-facing content published on SD-hosted sites. An experiment attaches to a target entity — today: posts/pages and pitch decks; survey and email variants exist in separate schemas with separate logic — assigns each visitor a deterministic variant via an FNV-1a hash of `(experimentId, visitorId)`, optionally replaces the entire block tree or slides array for the variant arm, fires server-side view events and client-side goal events (page view / CTA click / form submit), and surfaces a two-proportion z-test significance dashboard with a 100-visitor-per-arm threshold guard. The engine is entity-polymorphic and lives entirely inside the SD monorepo — no SDK, no script tag, no third-party data pipeline.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies using SD to build and publish client websites — they want to A/B test landing pages, proposals, and pitch decks for clients without paying for a separate experimentation platform.
- **End user:** The agency's clients' site visitors, who are silently bucketed and never know they're in a test.
- **Monetization:** Bundled in the SD subscription as a value-add differentiator for agencies managing client sites on the platform. Potentially gated at higher tiers (e.g. running experiments per plan); no usage-based meter today. AI-generated variant copy could become an AI-credit event.

## The edge
- **No third-party script, no client-side flicker:** Assignment is server-side (FNV-1a hash, no DB write on hot path for returning visitors), variant content is rendered server-side, and the block tree swap happens before the HTML leaves the server — zero layout shift, zero SDK install, zero cookie consent complexity beyond the existing `sd_visitor` UUID cookie.
- **Experiments live on content the platform already owns:** A variant's `blockTreeOverride` replaces the canonical `posts.content` JSON — the same block primitives the visual editor, CMS, and AI copy tools already understand. No translation layer, no external data model.
- **Deck A/B is table-stakes differentiated:** Testing a pitch deck variant (`applyAbToDeckSlides`) is something Optimizely and VWO don't natively support on a proposal/deck content model — it's a genuinely SD-specific surface.
- **MCP surface is an open unlock:** No MCP tools exist today, but 400+ MCP tools already operate the platform. An AI agent could generate variant copy, start an experiment, monitor significance, and auto-promote the winner — a closed loop no point tool offers without custom integration.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Optimizely (enterprise experimentation), VWO (SMB split testing + heatmaps), GrowthBook (open-source, stats-rigorous), PostHog (product analytics + feature flags + experiments), Statsig (feature gates + experiment platform).
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
The entire value proposition rests on agencies caring enough about conversion rate optimisation on *their clients' sites* to run experiments — rather than handing that responsibility to the clients themselves or ignoring it entirely. Deck A/B (the most differentiated surface) doesn't even call `applyAbToDeckSlides` on the public render paths yet. The council should attack whether agencies are actually the right buyer for an experimentation tool, or whether CRO is a specialist enough job that no agency running SD will ever reach for it when GrowthBook is free and PostHog is already in their stack.
