---
type: adr
domain: agent-harness
status: proposed
date: 2026-06-10
sources:
  - app/api/portal/brain/agent/route.ts
  - app/api/portal/ai/chat/route.ts
  - app/api/portal/ai/chat/stream/route.ts
  - lib/mcp/server.ts
  - lib/mcp/tools/index.ts
  - lib/mcp-auth.ts
  - lib/brain/mcp-sdk-adapter.ts
  - lib/ai/brain-tools/index.ts
  - lib/ai/brain-tools/classifier.ts
  - lib/ai/tracer.ts
  - lib/ai/portal-tools/index.ts
  - lib/ai/portal-tools/classifier.ts
  - lib/ai/CLAUDE.md
  - tests/unit/mcp-tool-registry-baseline.test.ts
  - tests/unit/portal-classifier.test.ts
---

# ADR: Agent Topology — Router + Hub-and-Spoke, Not Domain-Agent Mesh

## Status

Proposed — decision by Dan, 2026-06-10

## Context

There are three divergent agent / tool surfaces in the repo today:

### Surface 1 — External MCP registry

431 tools across 24 domain adapter files in `lib/mcp/tools/` (barrel: `lib/mcp/tools/index.ts`), composed by `lib/mcp/server.ts`. Separately, `lib/brain/mcp-sdk-adapter.ts` (5630 lines) wraps the Brain domain for MCP clients. Scope-gated via `hasScope` in `lib/mcp-auth.ts`. Tool count locked in `tests/unit/mcp-tool-registry-baseline.test.ts`.

Consumed exclusively by external MCP clients (Claude Code, Claude Desktop). The in-app agents do not call this server.

### Surface 2 — Company Brain agent (internal / staff)

`app/api/portal/brain/agent/route.ts` (548 lines). Full pipeline:

1. Haiku classifier (`lib/ai/brain-tools/classifier.ts`) — classifies intent
2. Haiku planner (complex requests only) — decomposes into steps
3. Model routing — simple requests stay on Haiku, complex route to Sonnet
4. Agentic loop — up to 8 iterations / 20 tool calls over the 12-tool `BRAIN_TOOLS` array (`lib/ai/brain-tools/index.ts`)
5. Haiku groundedness check — verifies the answer is grounded in retrieved content

Hybrid lexical + semantic RAG. Outputs pass through `lib/ai/brain-tools/sanitizer.ts`. Conversations persisted to `ai_conversations` / `ai_messages`.

### Surface 3 — Portal chatbot (client-facing)

`app/api/portal/ai/chat/route.ts` (297 lines) + `components/portal/AIChatWidget.tsx`. Blocks staff (audience-separated from Brain). Manages tenant portal data via ~15 tools in `lib/ai/portal-tools/`. Single Sonnet loop — no classifier, no planner, no groundedness check.

A streaming variant at `app/api/portal/ai/chat/stream/` exists but currently has no tools and hardcodes Opus + prompt caching.

---

## Decision

**Keep Brain and chatbot as two separate agents.** They differ on both axes that genuinely warrant separation:

| Axis | Brain agent | Portal chatbot |
|---|---|---|
| System context | Company knowledge, staff conventions | Tenant portal ops, client data |
| Tools + trust boundary | Staff / read-knowledge | Client / write-portal-data |

Same architecture, two instantiations. This is correct; do not merge them.

**Do NOT build a domain-agent-per-MCP-adapter mesh behind the chatbot.** The 431 MCP tools are a tool taxonomy, not an agent boundary. A sub-agent earns its added latency only when it brings something a tool call cannot:

- Its own specialized system context
- Its own RAG / knowledge store
- Its own model routing
- Its own multi-step reasoning loop

Wrapping plain CRUD tools (tickets, invoices, profile) in a sub-agent is cargo-culting the orchestration pattern. The extra LLM hop, context-handoff failure point, and latency cost are not justified.

**Prefer hub-and-spoke with a router.** The chatbot becomes a router / intent classifier that loads only the relevant domain's tool subset + context per request, plus a thin executor for simple domains. Promote a domain to a real specialist sub-agent only where it has genuine specialization:

- Brain / knowledge — already a separate agent (proven: RAG + groundedness + model routing)
- Visual-editor / block authoring — candidate (deep instructions + multi-step loop)
- Site migration — candidate (deep domain knowledge + multi-step process)
- Routine CRUD (tickets, invoices, profile, branding) — stays as plain tools

---

## Consequences

Follow-up checklist (tech-debt and immediate wins unlocked by this decision):

- [ ] **Tool-surface consolidation** — three tool surfaces (MCP 431 / Brain 12 / portal ~15) drift independently. A single tool-definition source of truth is higher-value than adding agents. See [[Unify AI Tool Surfaces]] for the full spec.
- [x] **Classifier for the portal chatbot** — SHIPPED 2026-06-10. `lib/ai/portal-tools/classifier.ts` (83 lines) runs pre-loop in `app/api/portal/ai/chat/route.ts` (309 lines); `loopModel` is chosen from complexity result; classifier tokens folded into credit accounting; chosen model returned in response `data.model`. Tests: `tests/unit/portal-classifier.test.ts` (202 lines, 8 cases). Model-assignments table updated in `lib/ai/CLAUDE.md`.
- [x] **Real observability before sub-agents** — SHIPPED 2026-06-10: Sentry is live, so the stdout shim was promoted to shared `lib/ai/tracer.ts`, now emitting real Sentry performance spans in prod (`tracesSampleRate` 0.1) with a `console.warn` JSON dev fallback. The Brain agent's 5 `withSpan` call sites were repointed unchanged; the portal chatbot — which had zero tracing — now wraps its classifier (`portal.classify`) and tool executions (`portal.tool`). This clears the observability prerequisite for adding the first domain specialist (see `[[Visual-Editor Agent]]`).
- [ ] **Intent router for the chatbot** — add a router / intent-classifier as the first step in the chatbot loop. Measure tool-selection accuracy and latency before considering any sub-agent delegation.
- [ ] **Streaming variant — DECISION 2026-06-10: KEEP as convergence target.** `app/api/portal/ai/chat/stream/route.ts` is the mobile-first SSE path (bearer-token auth via `resolvePortalFromRequest`, Opus 4.7 + prompt-caching, disconnect-safe persistence). Converging, not retiring: Phase 4 wires `PORTAL_TOOLS` + `executePortalTool` AND the Haiku classifier routing into the stream route, then `AIChatWidget` switches to it. Not done this session — text-only pending Phase 4.

New invariant: **a domain does not become a sub-agent until it has demonstrated specialization that a tool cannot provide.** Document the case in an ADR before splitting.

---

## Alternatives considered

**Domain-agent mesh (rejected)** — one sub-agent per MCP domain adapter (tickets-agent, billing-agent, cms-agent, etc.), each gated by the hub. Attractive because the domain boundaries already exist in `lib/mcp/tools/`. Rejected because: (a) none of the routine CRUD domains carry specialized system context, RAG, or multi-step loops; (b) each hop adds latency and a context-handoff failure point; (c) tool-selection accuracy at the hub becomes the bottleneck and is harder to debug across agent boundaries than within a single loop.

**Single unified agent (rejected)** — merge Brain and chatbot into one agent with a larger tool set. Rejected because the two agents have incompatible audiences (staff vs client), different trust boundaries, and different RAG needs. A single system prompt cannot serve both well.

---

## Related

- Architecture reference: [[Building Custom Agents — Principles]]
- Domain maps: [[Company Brain & AI]] · [[Chat, Realtime & Voice]]
- MCP architecture: [[MCP Server]]
- Agent harness: [[Agent Harness]]
