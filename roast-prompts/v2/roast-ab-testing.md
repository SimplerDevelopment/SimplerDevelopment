# Roast V2: AB Testing — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

Proposal/deck split testing for the agency's own pitches — not a CRO layer for client sites. An experiment attaches to a pitch deck, assigns each viewer a deterministic variant via an FNV-1a hash of `(experimentId, visitorId)`, replaces the slides array for the variant arm via `applyAbToDeckSlides`, and records view and goal events (deck open / slide completion / CTA click). A lightweight significance indicator (not an auto-promoting stats engine) surfaces in the agency dashboard with a human-approval gate before any winner is promoted. Landing-page A/B remains available for bundled completeness but receives no stat investment: SMB client traffic rarely reaches any resolution threshold, and the council already ruled that hardening stats nobody feeds is pure maintenance drag.

The engine is the same entity-polymorphic, server-side FNV-1a assignment and block-tree-swap architecture as before. The pivot is the target entity — from the agency's clients' pages to the agency's own revenue-generating proposals.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies using SD to send and close proposals — they want to know which deck framing, pricing order, or case-study wins deals, without a separate tool and without leaving the platform where the deal already lives.
- **End user:** The agency itself (the account manager or founder reviewing which variant closed more); the prospect who views the deck is the test subject.
- **Monetization:** No standalone ambition — bundled retention layer. AI variant copy generation (generate a challenger headline or section rewrite from Brain context) fires an AI-credit event, making experimentation the credit-burn monetization wedge rather than a seat add-on. No usage-based meter on experiment runs today; tier-gating (e.g. N concurrent experiments per plan) is a later pricing lever.

## The edge

- **Deck/proposal A/B is irreducibly SD-specific:** Testing which version of your pitch deck closes more clients is something Optimizely, VWO, GrowthBook, and PostHog don't model — they have no proposal/deck content surface. This is the one use case no point tool addresses without custom integration.
- **No third-party script, no client-side flicker:** Assignment is server-side (FNV-1a hash, no DB write on hot path for returning viewers), variant slides are rendered server-side, zero SDK install — the same structural advantage as before, now applied to the surface that earns it.
- **Experiments live on content the platform already owns:** A variant's `blockTreeOverride` or slides-array replacement uses the same block primitives the visual editor, CMS, and AI copy tools understand — no translation layer, no external data model.
- **AI variant generation closes the loop:** The MCP surface (Brain context + `applyAbToDeckSlides`) lets an agent generate a challenger variant, start the experiment, monitor significance, and surface the result for human promotion — a closed agentic loop no point tool offers without custom integration. This is the only version of the "MCP unlock" claim that has a concrete, plausible user.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- **GO-LIVE BLOCKER — `applyAbToDeckSlides` not wired to the public render path.** The entire deck/proposal A/B wedge is currently vaporware: `applyAbToDeckSlides` is implemented but not called on the public deck view routes. Wiring it into the public render path is the first committed increment before any GTM claim is made. This is concrete code work, not a positioning change — it will not be claimed as done until it ships and the public render path exercises it end-to-end.
- **AI auto-promote gated behind human approval.** The naive z-test + hard 100-visitor floor that the prior brief positioned as a decision instrument is demoted: significance is a signal, not a trigger. Any AI auto-promote of a winning variant must flow through the same human-approval queue (pending-change review) that governs AI CMS writes elsewhere in the platform. This is the correct posture for a solo team that cannot absorb false positives shipping to client-facing surfaces.
- Landing-page A/B is not deprecated — it remains available via the same engine — but it receives no additional stat rigor investment. On SMB client traffic it will almost never reach resolution; the council's ruling stands.
- Must compete with what agencies already use: GrowthBook (free, stats-rigorous), PostHog (product analytics + experiments), Statsig. The winning argument is not stat sophistication — it is native surface (proposal/deck) and zero additional tool to buy.

## Roast it on two lenses

1. **Earns its place in the suite?** Does deck/proposal A/B — with `applyAbToDeckSlides` wired and AI variant generation available — create genuine retention value and a differentiated story, or is "which deck closed more" a feature agencies already solve with their CRM win-rate reports and Gong call recordings?
2. **Could it stand alone?** No standalone ambition. Bundle-only, bundled retention layer. The edge is entirely derivative of co-location with proposals/decks: there is no wedge outside the suite, and no traffic outside the platform to experiment on. Lens B verdict is a given — the council should spend its time on lens A.

## Riskiest assumption to pressure-test

The prior riskiest assumption (agencies run CRO on client sites) has been abandoned. The de-risked posture is: **agencies care enough about their own win rate to test proposal variants and act on the result, at volumes high enough that the experiment resolves within a reasonable sales cycle.** The council should attack whether agencies send enough proposals per month to ever accumulate meaningful signal, or whether "deck A/B" is just as stuck in "gathering data" as "client site A/B" was — just with a more sympathetic buyer motivation. The cheapest test remains the one the prior council prescribed: run one deck A/B on the founder's own live sales proposal this week, before writing another line of engine code.
