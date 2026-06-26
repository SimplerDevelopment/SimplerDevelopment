# Roast: Pitch Decks & Product Designer — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

**Note to council:** This domain map covers two structurally different tools that share a database schema file but have almost no feature overlap. Roast them separately and flag whether bundling them together is itself a strategic mistake.

**Pitch Decks** — AI-authored, block-editor-based presentation tool where all MCP writes land in a `draft.*` overlay on each slide, and the public renderer reads only live fields until an explicit publish call (`decks_publish_slide` / `decks_publish_all`). Tenants create, iterate, version-snapshot, fork, and publicly share slide decks. Slides use the same block types as the CMS visual editor. Branding profiles auto-resolve on create. Decision slides (`decisionSlide`, `decisionCover`, `decisionOptions`) with path-group branching turn a static pitch into an interactive sales or proposal flow. Survey slides embed live survey forms (with the recommendation engine) directly inside a deck. 12 MCP tools let an AI agent author an entire deck — including generating and regenerating individual slides — without the human touching the editor.

**Product Designer** — Fabric.js canvas tool ported from a separate monorepo (philaprints), embedded in the storefront. Store customers design custom text, icons, and images on product mockups (T-shirts, mugs, etc.) per style per side. Designs are keyed per product and can be AI-image or AI-text generated, shared via public UUID link, saved as templates, and claimed from anonymous sessions. This is a custom print/merchandise personalisation tool for commerce tenants, not a presentation tool.

## Who it's for & how it makes money

- **Primary buyer (decks):** Digital agencies running SD as their business OS — they use decks to pitch new clients, deliver proposals, and build interactive sales flows for their own agency; they can also create decks as a deliverable for their clients.
- **Primary buyer (product designer):** Agencies running e-commerce client sites that sell custom-print merchandise — the designer replaces a Printful/Printify configurator with an on-platform canvas.
- **End user:** Deck viewers (prospects, investors, clients at a public URL); store customers who personalise products before checkout.
- **Monetization:** Pitch decks gated via `requireService(clientId, 'pitch-decks')` on MCP writes — upsellable service line. Product Designer is gated per product via `products.designable` flag — available to any commerce-enabled tenant.

## The edge

- **Full MCP agent authoring loop for decks.** 12 tools let an AI agent create a deck, replace slides, add slides, regenerate individual slides, upload HTML/ZIP, fork a deck, and publish — all without a human in the editor loop. The draft/live separation means the agent can prepare a complete deck in draft; the human reviews and publishes. No competitor (Pitch, Gamma, Tome) exposes anything close to a programmable deck-authoring API.
- **Branching / interactive decks with embedded surveys.** Decision slides let the presenter steer the deck based on the prospect's path; a survey embedded as a slide runs the recommendation engine inline and branches the narrative accordingly. This is a sales tool, not just a presentation tool.
- **Branding auto-resolution and version snapshots.** Every deck inherits the tenant's branding profile on create; every AI edit snapshots a restorable version (`trigger: 'ai_slide_edit'`). The agency can never permanently lose a human-crafted slide to a bad AI regeneration.
- **HTML/ZIP import.** Agencies can import any existing HTML slide (up to 50 MB ZIP) as a native deck slide, bridging the gap for clients with existing Gamma/Canva exports.
- **Real-time multi-user sync via internal publisher.** MCP write tools call `publishSlidesUpdate` so concurrent editor sessions see agent changes live — collaborative authoring where the AI is a real participant, not just a one-shot generator.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Pitch, Gamma, Canva, Beautiful.ai, Tome.
- The Product Designer is a ported codebase (philaprints monorepo) using Fabric.js — a client-only, non-SSR dependency that adds a distinct maintenance surface.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses

1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test

An AI agent can author a complete, client-presentable pitch deck via the MCP tool chain — with coherent narrative, proper branding, and decision-slide branching — without requiring slide-by-slide human intervention, making the MCP-native authoring loop a genuine competitive moat rather than a fragile demo that works on toy decks but breaks down on real agency deliverables.
