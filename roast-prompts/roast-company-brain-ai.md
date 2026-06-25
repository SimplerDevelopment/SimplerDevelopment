# Roast: Company Brain & AI — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
Company Brain is a per-tenant AI knowledge base where each agency gets an isolated workspace of semantically indexed notes, decisions, people, meetings, documents, playbooks, initiatives, goals, org charts, and a glossary — all queryable via hybrid keyword + pgvector semantic search. An AI agent layer (Anthropic Claude + OpenAI embeddings, BYOK-capable) drives a classifier → planner → tool-loop → grounder pipeline with a mandatory human review queue: AI output never auto-commits to canonical data. A separate Portal AI assistant uses the same guardrails to drive cross-domain actions (CRM, CMS, billing, bookings, email) via streaming tool-use chat. Both have been rebuilt as Mastra v1 primitives connecting to the platform's own 400+ tool MCP server.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies who want institutional memory — meeting notes that auto-link to CRM contacts, decisions that don't get lost in Slack, a "who knows what" expertise map across the team.
- **End user:** Agency team members querying their own Brain; the Portal AI assistant also surfaces as an in-portal chat for the agency's clients to self-serve within the portal (scoped to their data).
- **Monetization:** AI calls are plan-gated (`checkAiPlanGate`) and metered via AI credits (`recordAiUsage`); BYOK unlocks full throughput on lower tiers. Starter-tier agencies get a free sample; growth/pro tiers include a credit allowance; heavy users top up. This is the primary per-seat upsell lever in the platform.

## The edge
- **Human-review queue is load-bearing, not a checkbox.** AI-extracted content goes to `brain_ai_review_items` and requires explicit approval before committing. The grounder (`lib/ai/brain-tools/grounder.ts`) fires after every tool loop and forces "I don't know" on low-confidence answers rather than hallucinating a confident response. This is structurally different from Notion AI pasting text into a doc.
- **Fully MCP-operable by external agents.** The Brain exposes 12+ MCP tools (search, create note, list decisions, lookup glossary, create task, etc.) so Claude Code, Cursor, or a Mastra workflow can write to the company knowledge base as part of a development loop — not just read from it. No competitor in this space is operable by a coding agent.
- **Same data model, zero context-switching.** Brain meetings auto-link to CRM contacts (`classify-crm.ts`), Brain tasks promote to Kanban cards, Brain documents drive the required-reads compliance tracker, and inbound Gmail is ingested directly. The knowledge graph is built from the agency's live operational data, not a separate wiki import.
- **BYOK + provider-agnostic seam.** `lib/ai/llm.ts` is a thin provider seam; `resolveClientApiKey` lets tenants supply their own Anthropic/OpenAI keys, capped at 60s-cached resolution. Tenants with their own API agreements pay their provider directly; SD earns on the platform plan rather than token markup.
- **Industry templates bootstrap cold-start.** New tenant Brain gets pre-seeded taxonomy from `lib/brain/industry-templates/` — agencies aren't staring at an empty knowledge base on day one.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Notion AI, Glean, Guru, Dust, Mem.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That agencies will actually populate and maintain a Company Brain consistently enough for semantic search to return useful results — the "knowledge base adoption" problem that has killed every prior generation of wiki/intranet tool, and that AI retrieval quality degrades gracefully rather than confidently to garbage when the corpus is sparse or stale.
