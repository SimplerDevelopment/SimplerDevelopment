# Roast V2: Projects, Tickets & Kanban — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

**V2 pivot:** The council's prior verdict killed the "replace Linear" thesis. This brief fully adopts the prescribed reshape: reposition as a thin, high-value client-facing delivery layer and structured upsell catalog that sits *on top of* the agency's existing PM tool — not alongside it or instead of it.

## The idea

SD's Projects, Tickets & Kanban domain is the **client-facing delivery and structured upsell layer** for portal clients. The agency keeps Linear, Jira, or ClickUp for internal dev work. What SD adds on top is: a client-readable progress view, SLA-stamped support tickets (urgent 2h first response through to low 24h/168h), and — the headline feature — the **Suggested Projects catalog**, where agencies publish pre-packaged service offerings and clients request them in one click. Internally, a `workflowState` field decoupled from column position allows sprint planning with full scope history; polymorphic artifact links connect kanban cards to proposals, email campaigns, pitch decks, websites, booking pages, surveys, projects, posts, and Brain notes through a single `kanban_card_artifacts` join model. Every row is `clientId`-scoped.

No standalone ambition — bundled retention layer.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies that need a client-facing portal where clients can check delivery status, file support tickets, and browse/request new service packages — without the agency having to move their dev team off the tools those devs already use.
- **End user:** The agency's clients — logged into the portal to view sprint progress (read-only), reply to tickets, and self-serve new project requests through the Suggested Projects catalog.
- **Monetization:** Bundled in the core SD subscription. Value accrues as retention via the upsell catalog (every client request flows through SD, not a side-channel email or call) and via the artifact graph that ties sprint work to revenue.

## The edge

- **Suggested Projects catalog — no PM-tool equivalent, and natively wired to the rest of the suite.** Agencies publish pre-packaged service offerings; clients browse and request them in one click. **Honest competitive framing:** dedicated client-portal tools (ManyRequests, Assembly/Copilot Storefront, Wayfront, SPP) *do* ship service catalogs — so this is not a category-of-one. What those don't have is the *integration*: a request here lands in the same tenancy as the CRM deal, the proposal, the contract, and the delivery board, with no middleware. So the claim is "no *PM* tool (Jira/Linear/Asana/ClickUp) has it, and the standalone client-portal tools that do can't wire it to a co-located CRM/contracts/delivery graph" — not "nobody has a catalog."
- **Cross-domain artifact graph — links delivery to the rest of the suite.** A kanban card links (via `kanban_card_artifacts`) to the open proposal, the email campaign, the pitch deck, the website, the booking page, the survey, the parent project, posts, and Brain notes — the artifact types the join actually supports today. **Honest scope:** the shipped, defensible claim is the linkage itself — no PM-only tool can wire a delivery card to a co-located proposal / campaign / site, because those only exist when delivery and the rest of the suite share one tenancy. CRM-deal and signed-contract links — and a packaged "did this sprint generate revenue?" attribution view — are the near-term build *on top*, not shipped: the deal/contract artifact tables exist on the CRM side (`crm_deal_artifacts`), but the kanban-card→deal/contract link and the attribution report are roadmap, not live. The differentiator does **not** depend on the revenue-attribution framing; it stands on the cross-domain linkage that ships today.
- **Brain task → kanban card promotion.** `app/api/portal/brain/tasks/[id]/promote-to-kanban/` converts an AI-generated or meeting-extracted Brain task directly into a scoped kanban card. The loop from "AI noticed this action item in a meeting note" to "it's on the sprint board" is zero-friction.
- **Read-mostly client portal view as the wedge.** Clients see sprint progress and file SLA tickets without ever touching the agency's internal sprint board. The agency's devs stay on their existing tooling; the client-facing surface is purely additive.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Scope is explicitly *not* PM replacement. The feature set need not match Linear's keyboard shortcuts, search, or API depth — it needs to out-compete the agency's *current* client communication method (email threads, shared Notion docs, copy-pasted Loom links).
- **Linear/Jira sync is an optional roadmap item — NOT a go-live blocker.** The shipped wedge stands on its own: the Suggested Projects catalog (`app/portal/suggested-projects/`, `lib/db/schema/pm.ts`), the client-facing progress portal, SLA tickets, and the artifact graph (`kanban_card_artifacts`) are all built and live. The key to why no sync is required: the client-facing layer and the agency's PM tool serve **different audiences** — SD's surface is a curated *client-readable progress view + self-serve upsell catalog* for the agency's clients, while Linear/Jira stays the *internal dev* tool. They are not the same board duplicated; the client view is a read-mostly mirror the agency curates, not a second place devs do their work. So the "do I have to duplicate work?" objection is answered by the audience split, not by a sync connector. An *optional, one-way* status surface (Linear/Jira → the client board) is a future enhancement to trim even that light overlap — explicitly sequenced **after** the discovery-call demand signal below (a no-code validation), and the brief does not claim it as shipped or imminent.
- Time-to-first-dollar and maintainability by a tiny team both matter; features that win zero deals in discovery (event-sourced scope history, burndown-drift guarantees) should not be in the pitch.
- **Pricing and sales copy:** Drop the "lock-in because migration is painful" framing entirely. Sophisticated agency buyers hear hostage-taking. Lock-in accrues naturally from the artifact graph and the upsell catalog; it does not need to be stated.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the client-facing delivery layer + Suggested Projects catalog add meaningful retention and upsell value on top of what agencies already have — or is it a thin wrapper that clients ignore and agencies manage as overhead?
2. **Could it stand alone?** No standalone ambition — bundled retention layer. The artifact graph and upsell catalog only work because the CRM, contracts, Brain, and email campaigns are all co-located. Spun out, the Suggested Projects catalog is a lightweight request form with no downstream wiring; there is no viable standalone product here.

## Riskiest assumption to pressure-test

Agencies will add SD's client-facing delivery layer *on top of* their existing Linear/Jira workflow — giving clients a progress portal, SLA tickets, and a self-serve upsell catalog — without that additive surface creating enough double-entry friction to kill adoption.

The de-risked posture: test this with the A/B headline experiment and 5–8 discovery calls — a no-code validation that runs *before* any sync-connector work. If agencies say "I'd only want the client view + the catalog, not the internal board," the shipped wedge stands exactly as-is and the optional sync stays a low-priority roadmap item. If agencies say "I still need my devs to work in SD," that's a separate, larger product question (PM replacement) the brief explicitly does not chase — it does not gate today's client-facing wedge, which is already built and bundled.
