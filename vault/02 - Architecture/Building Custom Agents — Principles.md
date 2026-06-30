---
type: architecture
domain: agent-harness
status: active
date: 2026-06-10
sources:
  - app/api/portal/brain/agent/route.ts
  - lib/brain/agent-preferences.ts
  - lib/ai/brain-tools/index.ts
  - lib/ai/brain-tools/sanitizer.ts
  - lib/ai/tracer.ts
  - lib/ai/brain-tools/classifier.ts
  - lib/mcp/server.ts
  - lib/mcp-auth.ts
  - lib/brain/search.ts
  - lib/brain/embeddings.ts
  - lib/db/schema/brain.ts
  - drizzle/9001_brain_embedding_triggers.sql
  - app/api/portal/ai/chat/route.ts
  - app/api/portal/ai/chat/stream/route.ts
  - components/portal/AIChatWidget.tsx
  - tests/unit/mcp-tool-registry-baseline.test.ts
---

# Building Custom Agents — Principles

Distilled from the "Building Custom AI Agents" talk (https://youtu.be/ZWncOYMC12U). Seven principles for production agents, each mapped to the concrete implementation in this repo. Companion note: [[ADR agent-topology-router-not-domain-mesh]]. See also [[Agent Harness]] for the harness-level orchestration rules and [[Company Brain & AI]] for the domain map.

---

## 1. Why build custom agents

Off-the-shelf client agents (Claude Code, Cursor) know the internet but are blind to four things:

| Gap | What fills it here |
|---|---|
| Personal knowledge | Per-tenant `brainProfiles` preferences + per-user conversation history |
| Company knowledge / runbooks / policies | Company Brain knowledge base (notes, documents, decisions, glossary) |
| System access — read context + perform ops | 431 MCP tools exposed over `lib/mcp/server.ts`; ~20 portal chatbot tools in `lib/ai/portal-tools/` |
| Observability | `lib/ai/tracer.ts` (real Sentry spans in prod; dev console fallback) |

The key framing: "hallucination" is usually just the agent not knowing what you know. The fix is context, not model size.

---

## 2. Universal agent architecture

```
user input + system context
        │
        ▼
       LLM  ──requests tool execution──►  agent runs tool
        ▲                                        │
        └────────── tool result ─────────────────┘
        (repeat until LLM has enough)
        │
        ▼
     reply
```

The agent itself is code with zero intelligence. You control exactly three things: **system context**, **tools**, and **the agent loop**.

**Our implementation:** `app/api/portal/brain/agent/route.ts` (548 lines) runs this loop with a hard cap of 8 iterations / 20 tool calls. The loop is deliberately shallow — a single level, not a recursive sub-agent tree (see [[ADR agent-topology-router-not-domain-mesh]]).

---

## 3. System context

The system prompt fed to the LLM on every request. Generic context "won't get you far" — make it dynamic and org-specific.

**Our implementation:** Per-tenant agent preferences persisted in `lib/brain/agent-preferences.ts`. The field `brainProfiles.agentPreferences.frequentAreas` builds a long-term per-client memory of what each tenant asks about — the system context is shaped by it at request time. The Brain agent and the portal chatbot carry separate system prompts reflecting their different audiences (staff knowledge vs client portal ops).

---

## 4. Tools

LLMs assume zero tools unless explicitly described (what it does, why, how). Beyond LLM-invoked tools, two additional categories matter:

- **Deterministic tools** — always run by the agent regardless of LLM decision (rate limiting, audit logging).
- **Validation tools** — inspect/redact outputs before delivery (PII, confidential fields).

**Our implementation:**

| Surface | Tool count | Notes |
|---|---|---|
| Brain agent (`lib/ai/brain-tools/index.ts`) (447 lines) | 12 tools (`BRAIN_TOOLS`) | Hand-maintained array; validation/redaction via `lib/ai/brain-tools/sanitizer.ts` |
| Portal chatbot (`lib/ai/portal-tools/`) | ~15 tools | Tenant CRUD operations; no output validation layer (gap) |
| External MCP server (`lib/mcp/server.ts`) | 431 tools across 24 domain adapters in `lib/mcp/tools/` | Scope-gated via `hasScope` in `lib/mcp-auth.ts`; count locked in `tests/unit/mcp-tool-registry-baseline.test.ts` |

The three surfaces currently drift independently — a consolidation to a single tool-definition source of truth is higher-value than adding agents. See [[ADR agent-topology-router-not-domain-mesh]] §Consequences.

---

## 5. Knowledge / RAG

Pattern: ingest sources → embeddings (text → high-dimensional vectors) → vector DB. At query time: embed the query → proximity search → feed relevant chunks to the LLM. Key rule: **just-in-time retrieval, not dump-everything** — context windows fill fast.

**Our implementation:**

- Hybrid lexical + semantic search in `lib/brain/search.ts`
- Embeddings via OpenAI `text-embedding-3-small` in `lib/brain/embeddings.ts`
- pgvector-backed embeddings over the `brain_embeddings` table; schema at `lib/db/schema/brain.ts`, queue triggers in `drizzle/9001_brain_embedding_triggers.sql`
- Fail-soft if `OPENAI_API_KEY` is absent (gracefully degrades to lexical-only)

---

## 6. Orchestration of multiple agents

Standard pattern: client agents delegate specialist tasks to purpose-built agents, typically over MCP (de-facto agent-to-agent protocol) + REST/HTTP; the topology grows into a mesh of local + remote agents.

**Our implementation and the decision not to build a mesh:** The in-repo MCP server is consumed by external clients (Claude Code / Claude Desktop). The in-app agents (Brain, portal chatbot) bypass MCP and call `lib/brain/*` / `lib/ai/portal-tools/*` data functions directly. See [[ADR agent-topology-router-not-domain-mesh]] for the full reasoning: the 431 MCP tools are a tool taxonomy, not an agent boundary; a sub-agent only earns its added latency when it carries genuine specialization (its own system context, RAG, model routing, or multi-step loop). The preferred topology is hub-and-spoke with a router, not a domain-agent mesh.

---

## 7. Security, Observability, Cost

These three arrive at the end but they are not afterthoughts — they define production readiness.

### Security

LLM decisions are bounded by available tools. Guardrails intercept LLM-to-agent requests and accept/reject via automatic rules or human approval.

**Our implementation:** Scope guards via `hasScope` in `lib/mcp-auth.ts` gate every MCP tool. The human-approval pattern (approval URLs flipping draft → active) appears across SD workflow skills.

### Observability

Both input and output are unpredictable — a new problem for software that previously had deterministic I/O. The only handle is tracing (OpenTelemetry recommended).

**Our implementation:** `lib/ai/tracer.ts` (shared by the Brain agent + portal chatbot) emits real Sentry performance spans in prod (`tracesSampleRate` 0.1) and falls back to structured JSON via `console.warn` in dev. Shipped 2026-06-10, retiring the earlier stdout-only shim — the observability prerequisite for adding a multi-agent topology is now met. The chatbot's `portal.classify` / `portal.tool` spans give it tracing it previously lacked.

### Cost

Per-request cost is unpredictable. The mitigation: a cheap classifier routes each request to an expensive reasoning model vs a cheap one.

**Our implementation — partial:**

| Agent | Classifier present |
|---|---|
| Brain agent (`app/api/portal/brain/agent/route.ts`) | Yes — `lib/ai/brain-tools/classifier.ts` runs Haiku first; simple requests stay on Haiku, complex route to Sonnet |
| Portal chatbot (`app/api/portal/ai/chat/route.ts`) (297 lines) | No — hardcodes Sonnet for every request (gap) |
| Streaming chatbot (`app/api/portal/ai/chat/stream/`) | No — hardcodes Opus + prompt caching, no tools at all |

Cheapest immediate win: give the portal chatbot the Brain agent's classifier → model-routing logic.
