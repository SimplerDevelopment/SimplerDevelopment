# Roast V2: Projects, Tickets & Kanban — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

**V2 pivot:** The council's prior verdict killed the "replace Linear" thesis. This brief fully adopts the prescribed reshape: reposition as a thin, high-value client-facing delivery layer and structured upsell catalog that sits *on top of* the agency's existing PM tool — not alongside it or instead of it.

## The idea

SD's Projects, Tickets & Kanban domain is the **client-facing delivery and structured upsell layer** for portal clients. The agency keeps Linear, Jira, or ClickUp for internal dev work. What SD adds on top is: a client-readable progress view, SLA-stamped support tickets (urgent 2h first response through to low 24h/168h), and — the headline feature — the **Suggested Projects catalog**, where agencies publish pre-packaged service offerings and clients request them in one click. Internally, a `workflowState` field decoupled from column position allows sprint planning with full scope history; polymorphic artifact links connect kanban cards to CRM deals, proposals, contracts, email campaigns, and Brain tasks through a single `kanban_card_artifacts` join model. Every row is `clientId`-scoped.

No standalone ambition — bundled retention layer.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies that need a client-facing portal where clients can check delivery status, file support tickets, and browse/request new service packages — without the agency having to move their dev team off the tools those devs already use.
- **End user:** The agency's clients — logged into the portal to view sprint progress (read-only), reply to tickets, and self-serve new project requests through the Suggested Projects catalog.
- **Monetization:** Bundled in the core SD subscription. Value accrues as retention via the upsell catalog (every client request flows through SD, not a side-channel email or call) and via the artifact graph that ties sprint work to revenue.

## The edge

- **Suggested Projects catalog — the only feature with no PM-tool equivalent.** Agencies publish pre-packaged service offerings; clients browse and request them in one click. This is a structured, repeatable sales intake flow baked into the delivery portal. No Jira, Linear, Asana, or ClickUp has anything like it — it is not a PM feature, it is a systematic upsell mechanism, and it lives where the client already is.
- **Cross-domain artifact graph framed as revenue attribution.** A kanban card can link to the CRM deal it delivered, the signed contract, the open proposal, the email campaign, and the Brain task — so the question "did this sprint generate revenue?" has a traceable answer. This is not available in any PM-only tool; it only exists because everything shares one data model.
- **Brain task → kanban card promotion.** `app/api/portal/brain/tasks/[id]/promote-to-kanban/` converts an AI-generated or meeting-extracted Brain task directly into a scoped kanban card. The loop from "AI noticed this action item in a meeting note" to "it's on the sprint board" is zero-friction.
- **Read-mostly client portal view as the wedge.** Clients see sprint progress and file SLA tickets without ever touching the agency's internal sprint board. The agency's devs stay on their existing tooling; the client-facing surface is purely additive.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Scope is explicitly *not* PM replacement. The feature set need not match Linear's keyboard shortcuts, search, or API depth — it needs to out-compete the agency's *current* client communication method (email threads, shared Notion docs, copy-pasted Loom links).
- **GO-LIVE BLOCKER (real code work, not yet done):** An optional Linear/Jira sync connector — surfacing card status bidirectionally between SD's client-facing board and the agency's internal dev tool — is required before the "sits on top of your existing PM tool" positioning is credible at a demo. Without it, a buyer's first question ("do I have to duplicate work?") has no answer. This is a committed, scoped integration build that gates the "complementary layer" GTM claim.
- Time-to-first-dollar and maintainability by a tiny team both matter; features that win zero deals in discovery (event-sourced scope history, burndown-drift guarantees) should not be in the pitch.
- **Pricing and sales copy:** Drop the "lock-in because migration is painful" framing entirely. Sophisticated agency buyers hear hostage-taking. Lock-in accrues naturally from the artifact graph and the upsell catalog; it does not need to be stated.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the client-facing delivery layer + Suggested Projects catalog add meaningful retention and upsell value on top of what agencies already have — or is it a thin wrapper that clients ignore and agencies manage as overhead?
2. **Could it stand alone?** No standalone ambition — bundled retention layer. The artifact graph and upsell catalog only work because the CRM, contracts, Brain, and email campaigns are all co-located. Spun out, the Suggested Projects catalog is a lightweight request form with no downstream wiring; there is no viable standalone product here.

## Riskiest assumption to pressure-test

Agencies will add SD's client-facing delivery layer *on top of* their existing Linear/Jira workflow — giving clients a progress portal, SLA tickets, and a self-serve upsell catalog — without that additive surface creating enough double-entry friction to kill adoption.

The de-risked posture: test this with the A/B headline experiment and 5–8 discovery calls before writing any sync-connector code. If agencies say "I'd only want the client view + the catalog, not the internal board," the constraint above is confirmed and the sync connector is the right blocker. If agencies say "I still need my devs to work in SD," the prior verdict's diagnosis was wrong and the riskiest assumption needs to be repriced.
