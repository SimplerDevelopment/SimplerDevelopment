# Roast: Projects, Tickets & Kanban — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SD's Projects, Tickets & Kanban domain is the full project-delivery layer for portal clients. It covers project creation, sprint planning with event-sourced scope history (so burndown charts can't drift retroactively), drag-and-drop kanban boards with a `workflowState` field intentionally decoupled from column position, a support-ticket system with SLA deadlines stamped at creation (urgent 2h first response / 8h resolution through to low 24h/168h), recurring cards, custom fields, saved views, project webhooks with delivery logs, and a "Suggested Projects" catalogue where agencies publish pre-defined service packages that clients can request in one click. Every row is `clientId`-scoped; cards can carry polymorphic artifact links to CRM deals, proposals, contracts, email campaigns, and Brain tasks through a single `kanban_card_artifacts` join model.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies that want to manage their own internal work and their client delivery inside the same portal where clients can see progress, file tickets, and request new projects.
- **End user:** The agency's clients — logged into the portal to view project boards, reply to tickets, and submit service requests through the Suggested Projects catalog.
- **Monetization:** Part of the core SD subscription; no separate PM add-on. Value accrues as lock-in — migrating a project's sprint history, artifacts, ticket threads, and cross-domain artifact links off SD is painful, which keeps agencies subscribed.

## The edge
- **Cross-domain artifact graph.** A kanban card can link to a CRM deal, a signed contract, an open proposal, an email campaign, a Brain task, and a booking — all from the same card detail drawer. No PM-only tool can model "the deliverable lives here, and here's the deal we sold, the contract we signed, and the campaign we're delivering." This is only possible because everything shares one data model.
- **Brain task → kanban card promotion.** `app/api/portal/brain/tasks/[id]/promote-to-kanban/` converts a Company Brain task (AI-generated, meeting-extracted) directly into a scoped kanban card. The loop from "AI noticed this action item in a meeting note" to "it's on the sprint board" is zero-friction.
- **Publishing Command Center as a system-managed PM board.** Content publishing runs on a `systemKind='publishing'` project board where kanban cards carry `campaignId` and `scheduledFor` fields that mirror onto CMS posts and email campaigns. This means the same sprint planning and kanban UI drives content delivery without a separate editorial calendar tool.
- **Suggested Projects catalog as structured agency upsell.** Agencies publish pre-packaged service offerings; clients browse and request them in one click. This turns a PM feature into a structured, repeatable sales intake flow — no equivalent in Jira, Linear, or ClickUp.
- **Event-sourced sprint scope history.** `sprint_scope_history` records every `added`/`removed`/`completed`/`reopened` action, not just current state. Burndown and velocity charts can't be gamed by removing cards retroactively — a correctness guarantee that most hosted PM tools skip.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Trello, Asana, Linear, Jira, ClickUp, Basecamp.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
Agencies will run their actual client delivery work on SD's PM board rather than keeping it on Linear, Jira, or ClickUp — tools whose keyboard shortcuts, integrations, and workflows their developers have years of muscle memory around — simply because the cross-domain artifact graph and client-portal visibility are worth the switching cost and the feature gap with best-of-breed.
