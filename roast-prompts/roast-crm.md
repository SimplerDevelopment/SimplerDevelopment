# Roast: CRM — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment's CRM is a full-featured, per-tenant relationship layer that manages companies, contacts, deals (Kanban pipeline with configurable stages, probability, and color), proposals (with token-gated public signing), e-signed contracts (DropboxSign, SHA-256 tamper detection, per-signer order), activities, lead scoring via configurable point rules, custom fields on contacts/companies/deals, duplicate detection and merge, and saved filter views — all strictly scoped to `clientId`. It is not bolted on; the pipeline auto-populates from inbound emails (the Brain classifies and upserts contacts), survey submissions can auto-route hot leads to a deal stage, and every deal can be linked to artifacts from the other 20 domains (proposals, bookings, email campaigns, projects, pitch decks).

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS — tracking their own prospects, active clients, and recurring contracts in the same tool where they deliver work.
- **End user:** The agency's team members (account managers, founders); their clients interact only with the token-gated proposal/contract signing URLs (no login required).
- **Monetization:** Bundled in the SD subscription as a retention anchor; AI-powered features (Brain-to-CRM email classification, deal insights, enrichment) metered via AI credits. Upsell path: higher-tier plan unlocks enrichment API integration and advanced scoring rules.

## The edge
- **End-to-end deal flow without leaving the tab.** A deal links to a live proposal (built and signed inside SD), a contract (e-signed, audit-trailed), a project board (Kanban), and a booking — no paste-and-pray across five SaaS tools. Competitors require integrations or manual sync to get this far.
- **AI auto-hydrates the pipeline.** The Brain's email-classification pipeline (`lib/brain/classify-crm.ts`) upserts contacts and surfaces CRM review items on inbound email — zero manual data entry for the typical agency handshake. Survey hot-lead auto-routing to a deal stage (configurable score threshold) is also shipped, not roadmap.
- **MCP-operable end-to-end.** All 30+ CRM MCP tools are scope-guarded and approval-gated (`stageOrApply` pattern). An AI agent (Claude Code, a Mastra workflow) can draft a proposal, move a deal stage, or log an activity — and the human approves one URL before anything commits. This is structurally different from "AI writes a summary in a sidebar."
- **Shared data model with delivery.** `crmDealArtifacts` links deals to live SD artifacts (email campaign, booking, pitch deck, project). Revenue attribution ("this campaign generated this deal") is native, not a webhook afterthought.
- **Multi-tenant by construction.** Every table is `clientId`-keyed with cascade delete; the tenancy gate is structural, not a filter someone can forget. Agencies can run their own CRM and manage each of their own clients' CRM data from the same platform without cross-contamination.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: HubSpot, Pipedrive, Salesforce, Attio, Close.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That agencies will migrate their active pipeline into SD's CRM rather than keeping HubSpot/Pipedrive for prospects and only using SD for project delivery — i.e., that "same login" is a stronger forcing function than switching-cost inertia on a tool that already has years of contact history in it.
