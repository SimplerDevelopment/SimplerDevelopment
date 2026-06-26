# Roast V2: Agentic OS — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

SimplerDevelopment's Agentic OS is the layer that makes the entire platform operable by AI agents. Its load-bearing claim is not tool count — it is structural human governance over AI writes across a cross-domain tenancy-safe surface. The **MCP server** (`lib/mcp/`) exposes the full platform as a custom MCP server: any MCP-compatible agent (Claude Code, Cursor, Mastra workflows, a custom harness) can operate CRM, Brain/RAG, CMS, email, bookings, surveys, contracts, automations, billing, and projects on behalf of a tenant using only a portal API key. Every tool is scope-guarded and tenant-scoped at the handler level. The structural differentiator is the `require_cms_approval` flag: toggled on a portal API key, it routes every MCP write tool through the pending-change queue before it lands — not a workflow the agency configures, a toggle on the key itself. The **Agentic OS admin dashboard** (`lib/agentic-os/`) catalogs 45 registered skills/crons with invariant rules and estimated runtimes. It is currently a developer-internal tool only (hard-gated at `NODE_ENV === 'development'`); it is not pitched as a shipped product feature in this brief (see Constraints — GO-LIVE BLOCKER A).

The repositioned pitch: SD is the only agency OS where every AI write is structurally human-gated and auditable across CRM, Brain, CMS, and contracts in one authenticated session.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies who want to deploy AI agents on real business work — draft proposals, move deals, publish content, book clients, run Brain playbooks — with structural human approval gates, not just "AI summarizes emails."
- **End user:** The AI agent itself (Claude, a Mastra workflow, a custom harness) operating on behalf of the agency's team.
- **Monetization:** The MCP server is a moat feature bundled with the SD platform subscription — it drives retention by making the platform uniquely AI-operable. No standalone ambition. The optional "Agent Access" plan unlocks write-scope grants (`automations:write`, `brain:write`, `crm:write`) as a paid add-on tier — gateable once the cheapest test (below) confirms agencies price the approval gate as a buying reason, not a footnote.
- **Honest starting posture:** Agencies buy SD for CRM/Brain/CMS and discover agents after commitment. The agentic layer is a retention hook and a premium add-on wedge — not a purchase driver. GTM leads with the domains; the agentic layer is the reason agencies don't leave.

## The edge

- **Key-level, default-on approval gating is the only structural claim no competitor can replicate cheaply.** The `require_cms_approval` flag on a portal API key routes every MCP write through the pending-change queue as a platform primitive. No agent framework (LangChain, CrewAI, Relay.app) and no vertical SaaS offers first-class "gate all AI writes for human approval" baked into the tool-authorization model itself. This is the headline.
- **Cross-domain compound surface in one authenticated session.** A single portal API key gives a scoped agent access to CRM + Brain + CMS + contracts + automations in one session with no per-integration wiring. Competitors require agencies to wire their own tools against their own APIs — SD ships the surface pre-built, tenancy-safe, and scope-gated.
- **Scope grants make authorization granular and auditable.** Each portal API key carries an explicit `scopes` array. The scope gate runs before every tool call; denials are logged as agent-action audit rows. Agencies can grant an agent exactly `brain:read` + `crm:read` and nothing else — structural RBAC on the agentic layer that competitors treat as application-layer configuration, not platform primitive.
- **Mastra agents + Company Brain are native consumers of the same surface.** SD's own AI features call the same MCP server external agents use. The agentic layer is not a bolt-on; it is how SD's own AI is built — so third-party agents inherit the same reliability guarantees as native ones.

## Constraints

- Solo founder / tiny team; SD is a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- The MCP server competes for mindshare with best-of-breed agent frameworks (LangChain/LangGraph, CrewAI, Relay.app, Lindy) that agencies may already pay for. SD's moat is not the framework — it is the pre-built, tenancy-safe, approval-gated tool surface those frameworks would have to build themselves.
- 400+ tool schemas are a maintenance liability as well as an asset: every Drizzle migration that changes a response shape is a silent tool-drift risk on a solo founder's watch. Pruning toward the three highest-value agency jobs (proposal drafting, deal movement, content publishing) de-risks this before it compounds.

**GO-LIVE BLOCKERs — committed, scoped, not yet closed:**

- **A — Dashboard production gate (code):** The Agentic OS admin dashboard is hard-gated at `NODE_ENV === 'development'`. Before it is pitched to ops leads (not devs), it must move to a production portal feature behind a feature flag so non-developer users can view active skills, cancel running agents, and inspect audit rows. Until this ships, the dashboard is internal developer tooling only and is not represented as a differentiator in any sales context.
- **B — Tool surface pruning (code):** Prune or deprioritize the tool surface toward the three highest-value agency jobs — proposal drafting, deal movement, content publishing — and explicitly instrument task-completion reliability (success rate, latency, fallback behavior) for those jobs before quoting tool count to any buyer. "400 tools" is not a go-to-market claim in V2; "90%+ task-completion on the jobs you actually run" is.
- **C — Cheapest test (no code):** Before pricing the "Agent Access" write-scope add-on, take the existing approval-gate capability to 5–10 target agencies with one question: "Would you pay an add-on for AI agents that can write to your CRM and publish content, where every write is human-approved by default?" If they lean in on the gate, price it. If they shrug and ask "is your CRM good?", it stays bundled retention only — no tiering.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the approval gate + scope-gated cross-domain surface create real retention and a credible premium add-on — or is it plumbing that agencies never consciously value and therefore never price?
2. **Could it stand alone?** No standalone ambition — this is a bundled retention layer and optional write-scope add-on only. The correct question for Lens B is: once the cheapest test lands, does the approval-gate primitive deserve its own pricing page within the SD bundle, or does it quietly carry the subscription without ever surfacing to the buyer?

## Riskiest assumption to pressure-test

That key-level approval gating is a *stated* buying reason — not just a reassurance agencies nod at and then forget. The prior brief's riskiest assumption (agencies choose SD *because* of MCP tools) is confirmed false. The de-risked version: the approval gate turns "discovered-after-purchase" into "reason not to leave," and eventually into a priced add-on for write-scope access. The cheapest test (Blocker C above) resolves this before any pricing decision. If agencies do not lean in on the gate, the agentic layer stays a quiet retention-infra investment, priorities shift to hardening the underlying domains, and tool-surface pruning becomes the primary near-term task.
