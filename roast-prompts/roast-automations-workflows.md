# Roast: Automations & Workflows — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment ships two distinct automation engines inside the same portal. The **Automation Rules engine** (`lib/automation/`) is event-driven and one-shot: when a CRM deal is won, a survey response submitted, a booking created, or a subscriber added, a flat rule fires a list of actions — send an email, start a playbook, run a plugin script, or invoke any platform MCP tool. Rules can also be time-triggered (daily/weekly/monthly/cron), created from NLP (describe an automation in plain English; Claude structured it into trigger/condition/action JSON), and are scope-gated (a rule can only execute actions for which it was granted explicit MCP scopes). The **Visual Workflow builder** (`lib/workflows/`) adds a ReactFlow canvas: a graph of typed trigger/action/condition nodes that can branch and chain, with starter templates and a synchronous test-run endpoint. The runtime is in-process, demo-grade (no durable queue, no retries), and trigger-wiring is a shim — the canvas is live but only manually-fired runs work today. Trigger links (`/go/<slug>`) round out the domain: tracked shortlinks that record click events (IP, user agent, referrer) for analytics, with a forward-looking hook to set CRM contact fields on click.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS — they want to automate the operational glue between their CRM, email, bookings, surveys, and client deliverables without paying for a separate Zapier subscription.
- **End user:** The agency's team (setting up rules); their clients and contacts (receiving emails, triggering bookings, submitting surveys that feed rules).
- **Monetization:** Rules engine bundled in the SD subscription. NLP parse calls consume AI credits billed via the tenant's Claude API key. Visual workflow builder is also bundled. Higher-tier plans could unlock longer execution history or more concurrent active rules.

## The edge
- **Native event bus with zero integration tax.** Automations fire from the same in-process events as the rest of SD — CRM deal won, survey response submitted, booking created — without external webhooks, OAuth credentials, or integration maintenance. Zapier and Make require configuring triggers as HTTP webhook URLs; SD events just work because the automation engine is co-located with the data.
- **NLP rule creation.** Describe an automation in plain English and Claude generates the structured trigger/condition/action JSON. No other in-app automation tool ships this as a first-class creation path (not a beta "AI suggestions" sidebar, but the primary authoring interface for simpler rules).
- **Scope gate is a real security boundary.** Every action dispatch checks whether the rule's granted `scopes` satisfy the required MCP tool scope before executing. Rules without a matching scope are skipped and logged. This makes automations auditable and controllable in a way generic webhook/action platforms are not.
- **Playbook bridge.** A rule action can start a Brain playbook, linking the light-weight event-driven engine to SD's structured multi-step playbook runtime — a pattern no point-tool competitor ships because they don't have an opinionated playbook system to bridge to.
- **Same login, same bill.** Agencies eliminate a Zapier subscription not because SD is cheaper in isolation, but because the automation benefit compounds: a triggered rule can touch CRM, email, bookings, and the Brain without crossing an API boundary or credential handoff.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Zapier, Make (Integromat), n8n, Workato.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That the in-process, fire-and-forget, no-retry automation engine is sufficient for the workflows agencies actually need — and that agencies will not immediately hit the ceiling (a serverless cold-start that hasn't imported the event bus won't fire rules; the visual workflow runtime has no retries, no parallelism, and a 5-second wait cap) and fall back to Zapier anyway. If the engine can't reliably execute in a serverless hosting environment under real load, the entire "no integration tax" edge collapses: agencies are better off with Zapier's documented reliability than a faster-to-set-up but failure-silent in-process bus.
