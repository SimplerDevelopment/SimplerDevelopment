# Roast: Agentic OS — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment's Agentic OS is the layer that makes the entire platform operable by AI agents. It has two components that must be judged together. The **MCP server** (`lib/mcp/`) is the product-level capability: 400+ scope-guarded tools covering every domain (CRM, Brain/RAG, CMS, email, bookings, surveys, contracts, automations, billing, projects) exposed as a custom MCP server that any MCP-compatible agent (Claude Code, Cursor, Mastra workflows, or a custom harness) can call. Tools are registered in lockstep (handler + schema + scope guard), approval-gated when configured (`require_cms_approval`), and tenant-scoped — an agent with a portal API key can operate the full platform on behalf of its tenant without touching the UI. The **Agentic OS admin dashboard** (`lib/agentic-os/`) is the developer-facing catalog: 45 registered skills/crons grouped by domain, with estimated runtimes, invariant rules, variable forms, and a subprocess runner that fires `claude -p --output-format stream-json` headless skills from the browser — currently local-dev only. Together, the pitch is that SD is not just a SaaS you click through; it is a fully MCP-addressable business OS that AI agents can operate end-to-end.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies who want to deploy AI agents to do real business work (draft proposals, move deals, publish content, book clients, run Brain playbooks) with human approval gates — not just "AI summarizes emails."
- **End user:** The AI agent itself (Claude, a Mastra workflow, a custom harness) operating on behalf of the agency's team.
- **Monetization:** The MCP server is a moat feature bundled with the SD platform subscription — it drives retention by making the platform uniquely AI-operable. Portal API keys with different scope grants could become a paid add-on tier (e.g., "Agent Access" plan unlocks `automations:write` and `brain:write` scopes). The Agentic OS dashboard is a developer tool with no direct revenue; its value is in keeping the agentic layer healthy and documented.

## The edge
- **400+ tools covering the entire business OS.** LangChain/LangGraph, CrewAI, Lindy, and Relay.app provide agent frameworks or integration layers — but they require you to wire up your own tools against your own APIs. SD's MCP server ships 400+ pre-built, scope-guarded, tenancy-safe tools covering every domain an agency uses, out of the box. An agent doesn't need to know your API; it just needs a portal API key.
- **Approval gates are structural, not bolted on.** The `require_cms_approval` flag on a portal API key routes every MCP write tool through the pending-change queue. This is not a workflow the user has to configure; it is a toggle on the key. No agent platform competitor has a first-class "gate all AI writes for human approval" concept built into the tool authorization model itself.
- **Scope grants make authorization granular and auditable.** Each portal API key carries an explicit `scopes` array. The scope gate runs before every MCP tool call, and scope denials are logged as agent-action audit rows. Agencies can grant an agent exactly `brain:read` + `crm:read` and nothing else — structural RBAC on the agentic layer.
- **Mastra agents + Company Brain are native consumers.** SD's own AI agents (Company Brain, Portal AI, Mastra workflows) call the same MCP server that external agents use. The agentic layer is not a bolt-on integration surface; it is how SD's own AI features are built.
- **The skill catalog / Agentic OS dashboard is a live audit of what the system can do.** 45 skills across 10 domains, with invariant rules cross-referenced to each — this is a developer-tooling differentiator for agencies building custom agent workflows on top of SD. No other vertical SaaS in this space ships a documented, executable skill registry.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: LangChain/LangGraph platforms, CrewAI, Zapier Central/AI Actions, Lindy, Relay.app.
- Time-to-first-dollar and maintainability by a tiny team both matter.
- **Honest caveat:** The Agentic OS admin dashboard is currently local-dev only (hard-gated at `NODE_ENV === 'development'`). The subprocess runner is a single-host, in-process map with no durable state. This part of the domain is a developer tool, not a shipped product feature.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That "400+ MCP tools over a vertical SaaS" is a compelling agent platform moat rather than just table stakes for any modern SaaS that wants AI integration — i.e., that agencies will choose SD *because* it has a rich MCP server rather than choosing SD for the underlying CRM/Brain/CMS features and treating the MCP server as a nice-to-have. If agent-platform features are not the buying criterion (agencies buy SD to run their business, then discover agents work on it), the Agentic OS is an enabling layer with no standalone value and questionable priority against hardening the underlying domain tools it exposes.
