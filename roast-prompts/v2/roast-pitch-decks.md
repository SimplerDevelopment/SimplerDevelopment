# Roast V2: Pitch Decks — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could Pitch Decks stand alone as its own product.

**V2 change summary:** Product Designer is split out and frozen. Pitch Decks is repositioned from "AI authors your pitch autonomously" to "agentic draft-assist grounded in live CRM/Brain/brand context." Autonomous-authoring claims are withheld until the 5-client survival test passes. The edge now leads with the context layer, not the tool count.

---

## The idea

**Two products were sharing a schema file. They are now treated as separate.**

**Pitch Decks** — AI-assisted, block-editor-based presentation tool where agency context (live CRM deal data, Company Brain content, active branding profile) is the raw material, and MCP tools let an agent author a complete contextual draft. All MCP writes land in a `draft.*` overlay per slide; the public renderer reads only live fields until an explicit publish call (`decks_publish_slide` / `decks_publish_all`). Tenants create, iterate, version-snapshot, fork, and publicly share decks. Decision slides (`decisionSlide`, `decisionCover`, `decisionOptions`) with path-group branching turn a static pitch into an interactive sales flow. Survey slides embed live survey forms with the recommendation engine directly inside a deck. The 12 MCP tools let an agent author a complete draft in one session — but the correctness of that draft depends on how well-populated the tenant's CRM and Brain are. That dependency is the product truth the prior brief obscured.

**Product Designer** — **Frozen. Separate product decision pending.** The Fabric.js canvas tool (ported from philaprints) is commerce-specific, non-SSR, and has almost no feature overlap with Pitch Decks beyond a shared schema file. Bundling them was an implementation accident, not a product strategy. It will not be roadmapped, marketed, or invested in alongside Pitch Decks until a dedicated commerce-tenant strategy resolves. The shared schema is an internal detail; no public positioning treats them as one module.

---

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS — they use Pitch Decks to pitch new clients, deliver proposals, and build interactive sales flows, grounded in live deal data and brand assets already in the platform.
- **Value prop (honest version):** The agent doesn't make something from nothing. It makes something from *your* CRM, your Brain, your branding — which is why the draft is contextually relevant rather than generic. Agencies with populated data get a genuinely useful draft-assist loop. Agencies with empty tables get a Gamma clone. That distinction is the GTM filter.
- **End user:** Deck viewers at a public URL (prospects, investors, clients).
- **Monetization:** Gated via `requireService(clientId, 'pitch-decks')` on MCP writes — upsellable service line. No separate Product Designer billing until the commerce-tenant decision is made.

---

## The edge

**Lead with the context layer, not the tool count.**

The defensible asset is not "12 MCP tools can author a deck." Every AI slide tool can generate slides. The defensible asset is: **those 12 tools draw from live CRM deals, Company Brain content, and the tenant's auto-resolved branding profile — so the draft is already personalized to the specific prospect and engagement, not to a blank prompt.**

- **Context-grounded drafting.** An agent calling `decks_create` on SD can pull the live deal stage, the company's prior case studies from the Brain, the prospect's industry, and the active branding profile in one session — before generating a single slide. Gamma, Tome, and Beautiful.ai start from a text prompt. SD starts from the account's actual context. That's the moat, and it only deepens as tenants populate more data.
- **Branching interactive-proposal wedge.** Decision slides let the presenter steer the deck based on the prospect's path; a survey embedded as a slide runs the recommendation engine inline and branches the narrative accordingly. This is a sales tool with a live decision surface, not a static presentation. No funded competitor ships this combination.
- **Draft/live separation with version snapshots.** Every AI edit snapshots a restorable version (`trigger: 'ai_slide_edit'`). The agent can prepare a full draft; the human reviews slide-by-slide and publishes. Agencies can never permanently lose a human-crafted slide to a bad AI regeneration.
- **HTML/ZIP import kills switching cost.** Agencies can import any existing HTML slide (up to 50 MB ZIP) as a native deck slide, bridging clients with Gamma/Canva exports. This removes the "we already have a deck format" objection.
- **API surface as standalone wedge (if pursued).** The MCP tool chain is a documented, programmable deck-authoring API. No competitor exposes anything close. If Pitch Decks is ever spun out, this is the wedge — not autonomy, but *programmability grounded in agency context*.

**What we are NOT claiming yet:** That the agent can author a client-presentable deck with no slide-by-slide human review. That claim is pending the 5-client survival test (see Constraints). Until it passes, the pitch is "best-in-class draft-assist that starts from your context" — not "autonomous authoring."

---

## Constraints

- Solo founder / tiny team; SD is a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- **VALIDATION GATE (not a code blocker, but a marketing gate):** The autonomous-authoring positioning is withheld until the 5-client survival test passes: take 3–5 real agency briefs (actual prospect, real brand assets, live competitive situation), run the full MCP authoring loop end-to-end, and count how many slides survive unedited into final client delivery. Over half = the autonomy claim is earned and should be marketed loudly. Under half = "agentic draft-assist" is the honest and permanent positioning. This test is doable in 48h against existing tenants since the tooling is already live. No new code required to run it.
- **Tool surface is frozen** until the survival test passes. No new MCP deck tools, no new slide types. Focus is on validating the quality of what ships, not expanding the surface.
- **Product Designer is formally separated** from the Pitch Decks roadmap. A commerce-tenant strategy decision gates any further investment there.
- The "must beat Pitch/Gamma/Canva/Beautiful.ai" framing is retired. The ICP is agencies already on SD with populated CRM and Brain — those agencies are not cross-shopping Gamma because they need the context coupling. Agencies without that data are out-of-scope for now.

---

## Roast it on two lenses

1. **Earns its place in the suite?** The context-grounded draft-assist claim is only credible for tenants with populated CRM and Brain data. Does that narrow the viable buyer set enough that the module only retains a subset of SD agencies — and if so, is the retention value still real? Is the draft/live separation genuinely better than "paste into Gamma," or does it require agencies to accept SD's editor as their deck tool as well?

2. **Could Pitch Decks stand alone?** No standalone ambition is being pursued today — the module is a bundled retention layer. If a spin-out case is made in the future, it leads on: (a) the programmable MCP API that no competitor offers, (b) the branching interactive-proposal wedge (decision slides + embedded surveys), and (c) HTML/ZIP import that kills switching cost from Gamma/Canva. It does NOT lead on "AI authors your pitch autonomously" until the 5-client survival test is passed and documented. The Product Designer has no standalone thesis and is explicitly excluded from any Pitch Decks spin-out narrative.

---

## Riskiest assumption to pressure-test

**For context-rich tenants (with live CRM deals, populated Brain content, and a complete branding profile), the agentic draft-assist loop produces decks where more than half the slides survive unedited into the final client delivery** — validating the "context-grounded draft-assist" positioning and earning the right to market the MCP authoring loop as a genuine competitive differentiator. If this test fails (fewer than half the slides survive), the module is repositioned as a high-quality outline generator, not a draft-to-delivery workflow — and the GTM doubles down on the branching interactive-proposal wedge rather than the authoring loop.
