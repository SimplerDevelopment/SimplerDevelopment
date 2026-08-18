---
type: adr
domain: brain-ai
status: accepted
date: 2026-07-07
decided: 2026-07-09
sources:
  - simplerdevelopment-agents/src/mastra/index.ts
  - simplerdevelopment-agents/src/mastra/mcp/sd-mcp.ts
  - lib/ai/mastra/ (deleted 2026-07-09, QAD-038)
  - app/api/portal/brain/agent-mastra/route.ts (deleted 2026-07-09, QAD-038)
  - app/api/portal/brain/agent/route.ts
  - vault/05 - Feature Specs/Company Brain Crown-Jewel Review 2026-07.md
---

# ADR: Consolidate Mastra on the separate-service integration

**Status: accepted** 2026-07-09 (owner sign-off via QAD-038). The in-process experiment (`lib/ai/mastra/**` + `/api/portal/brain/agent-mastra`) has been deleted and `@mastra/core` dropped from the app; the separate `simplerdevelopment-agents/` service is the committed shape. Remaining ADR items 2–3 (LibSQLStore→`@mastra/pg`, Phase-2 streaming wiring) tracked as separate cards.

## Context

The repo has TWO parallel, non-shared Mastra integrations (see [[ADR mastra-agents-mcp-client]] "Phase 1" addendum and the [[Company Brain Crown-Jewel Review 2026-07]]):

1. **Separate service** — `simplerdevelopment-agents/` (standalone Mastra runtime, port 4111, own deploy) consuming the portal's `/api/mcp` as an MCP client with a per-request tenant token in `RequestContext`. This is a near-verbatim implementation of Mastra's documented multi-tenant pattern. Only the daily `brain-agent-per-tenant` cron uses it.
2. **In-process** — `lib/ai/mastra/**` + `/api/portal/brain/agent-mastra` (an `@mastra/core` rebuild of the same tool-loop). Zero callers; the ADR above records its full loop as unproven end-to-end. Does not follow Mastra's embedded recipe (no `serverExternalPackages: ['@mastra/*']`, no `@mastra/ai-sdk` streaming bridge).

Two unshared implementations of one tool-loop (each independently hardcoding `maxSteps: 8`) is a drift factory the prior ADR itself predicted.

## Decision (proposed)

Commit to the **separate-service** approach as the single Mastra runtime and retire the in-process experiment. Mastra's official docs bless the standalone `mastra build` → Hono server for teams scaling the AI backend independently of the frontend — which is exactly why it was chosen (it dodges the Vercel serverless timeout that motivated the offload).

Concretely:
1. Keep `simplerdevelopment-agents/` as the only Mastra runtime, deployed via `mastra build` on Railway, with the documented MCPClient + `RequestContext` tenant-token bridge and the fail-closed `resolveSdMcpAuthToken` invariant.
2. Replace `LibSQLStore(file:./mastra.db)` with `@mastra/pg` (`PostgresStore`) against the existing Postgres so Memory + observability survive redeploys; adopt `MASTRA_RESOURCE_ID_KEY`/`MASTRA_THREAD_ID_KEY` mapping `resourceId → clientId` so Mastra's own tenant guardrail protects Memory at rest.
3. Wire the user-facing path by having `app/api/portal/brain/agent` call the service's streaming workflow/agent endpoints over HTTP (Phase 2 — Mastra's server exposes streaming, so SSE parity is achievable).
4. **Delete** `lib/ai/mastra/**` + `app/api/portal/brain/agent-mastra/route.ts` once this is recorded.
5. Document `SD_AGENTS_URL`, `SD_AGENTS_INTERNAL_SECRET`, `SD_MCP_URL`, `SD_MCP_API_KEY` in `.env.example`; complete the Spec's open P6 live-stack verification that `requestContext.token` reaches `sdMcp.listTools()` on Railway.
6. Do **not** adopt Mastra's PgVector/RAG toolset — the hand-rolled trigger-fed pgvector pipeline in `lib/brain` is the superior system of record; `brain_search` is the correct bridge.

Alternative rejected: bring the in-process path up to Mastra's embedded recipe. Rejected because the serverless-timeout constraint that motivated the offload still applies, and maintaining an embedded runtime in the Next process duplicates the service for no adoption benefit.

## Consequences

- Kills the dead in-process code and the two-tool-loop drift risk.
- Unblocks user-facing agent adoption behind one runtime with durable, tenant-scoped Memory.
- Costs: a Phase-2 streaming HTTP integration, a Railway Postgres store migration for Mastra Memory, and closing the env/verification gaps before the service can be trusted in production.
