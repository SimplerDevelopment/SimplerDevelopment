---
type: adr
domain: brain-ai
status: accepted
date: 2026-06-25
sources:
  - simplerdevelopment-agents/src/mastra/workflows/brain-workflow.ts
  - simplerdevelopment-agents/src/mastra/agents/brain-agent.ts
  - simplerdevelopment-agents/src/mastra/agents/brain-stages.ts
  - simplerdevelopment-agents/src/mastra/mcp/sd-mcp.ts
  - simplerdevelopment-agents/src/mastra/index.ts
  - simplerdevelopment-agents/BRAIN_AGENT_README.md
  - simplerdevelopment-agents/src/mastra/agents/portal-assistant.ts
  - simplerdevelopment-agents/src/mastra/agents/portal-intent.ts
  - simplerdevelopment-agents/src/run-portal.ts
  - app/api/portal/brain/agent/route.ts
  - app/api/portal/ai/chat/route.ts
  - app/api/mcp/route.ts
  - lib/ai/brain-tools/index.ts
  - lib/ai/portal-tools/index.ts
  - lib/ai/portal-tools/classifier.ts
---

# ADR: Rebuild SimplerDevelopment AI agents on Mastra; connect to the existing MCP server as a client

## Status

Accepted — implemented as a teaching example (2026-06-25). Not yet wired into the Next app runtime.

## Context

The parent app contains two hand-rolled AI agents that drive the Anthropic SDK directly:

**Company Brain agent** (`app/api/portal/brain/agent/route.ts`) — a classify → plan → tool-loop → groundedness pipeline over 12 `BRAIN_TOOLS` (`lib/ai/brain-tools/`). Runs Haiku for classification/planning/grounding and Sonnet for the agentic tool loop.

**Portal AI assistant** (`app/api/portal/ai/chat/route.ts` + `lib/ai/portal-tools/`) — a client-facing chat loop over ~15 portal-domain tools with a Haiku intent-router pre-step (shadow mode as of 2026-06-11; see [[ADR agent-topology-router-not-domain-mesh]]).

Both agents call the Anthropic SDK directly — no framework, no observability hooks, no Mastra Studio visibility, and no straightforward path to swapping provider or model via config. The MCP server (`app/api/mcp/route.ts`, stateless Streamable-HTTP) exposes ~400 portal tools scoped via `Bearer sd_mcp_…` keys, but the in-app agents do not consume it — they call `lib/ai/brain-tools/` and `lib/ai/portal-tools/` directly.

The open question was: when rebuilding on a framework (Mastra), where do the tools come from? Re-declare all ~400 portal tools inside the Mastra package, or connect the Mastra agent to the existing MCP server as a client?

## Decision

**Rebuild the Company Brain agent on Mastra primitives in the sibling package `simplerdevelopment-agents/` (Mastra v1, `@mastra/core ^1.46`). The Mastra agent gets its tools by connecting to the existing SimplerDevelopment MCP server as an MCP CLIENT — not by re-declaring tools.**

The `@mastra/mcp` `MCPClient` in `simplerdevelopment-agents/src/mastra/mcp/sd-mcp.ts` points at `POST /api/mcp` with a scoped portal API key (`brain:read + brain:write`). At agent-run time, `MCPClient.listTools()` fetches the live tool list. Tools remain owned exclusively by `lib/mcp/`; the Mastra package is a thin, swappable client.

The Mastra rebuild mirrors the existing pipeline structure:

| Mastra primitive | Role | Model |
|---|---|---|
| `src/mastra/workflows/brain-workflow.ts` | Workflow: classify → plan (complex only) → tool-loop Agent → groundedness check | — (orchestration only) |
| `src/mastra/agents/brain-stages.ts` | Classifier / planner / grounder Agents using `structuredOutput` | Claude Haiku 4.5 |
| `src/mastra/agents/brain-agent.ts` | Tool-loop Agent (agentic tool calls) | Claude Sonnet 4.6 |
| `src/mastra/mcp/sd-mcp.ts` | `MCPClient` pointed at `POST /api/mcp` | — |

Provider: Anthropic Claude, matching the parent app. Model strings are passed through Mastra's model router (e.g. `anthropic/claude-sonnet-4-6`).

**New invariant:** portal tools have one home — `lib/mcp/`. Any Mastra agent that needs portal tools consumes them via the MCP server client, never by re-declaring them in the Mastra package. This applies to future agents beyond the Brain example.

## Consequences

**Easier:**
- Tool definitions stay in one place (`lib/mcp/`). A tool added, renamed, or removed in the portal is immediately available to the Mastra client on the next `MCPClient.listTools()` call — no synchronization step.
- The Mastra package is decoupled from the portal's internals. It only needs an HTTP endpoint + a valid scoped API key.
- Mastra Studio visibility, built-in observability hooks, workflow tracing, and structured output validation are available to all agents in the package at zero per-tool cost.
- Provider / model swaps are config-level changes (model string); the workflow pipeline is provider-agnostic.
- The package builds independently (`mastra build`) and the non-tool stages (classify, plan, groundedness) run without a live portal — useful for testing pipeline logic in isolation.
- Adoption path is incremental: the existing hand-rolled route continues to serve the app; the Mastra workflow can be wired in at one endpoint at a time.

**Harder / accepted trade-offs:**
- A Mastra agent exercising portal tools requires a running parent app instance and a minted portal API key (brain:read + brain:write). Tool calls cannot be integration-tested without the portal.
- The MCP transport is stateless Streamable-HTTP; each tool call is a fresh HTTP round-trip, adding latency vs. in-process calls. Acceptable for a brain/knowledge agent where tool calls are infrequent and latency is already dominated by LLM inference.
- `MCPClient.listTools()` returns the full portal tool surface under the granted scopes. The agent must rely on the model's tool-selection ability (and the system prompt) to avoid invoking irrelevant tools. The scope gate (`brain:read + brain:write`) already narrows the surface; a tighter per-request filter can be added later.

**Status at time of decision:** `tsc --noEmit` clean; `mastra build` succeeds. Not yet wired into the Next app runtime. Adoption path documented in `simplerdevelopment-agents/BRAIN_AGENT_README.md`.

## Alternatives considered

**Alternative A — Re-implement tools natively in the Mastra package:** Each portal tool re-declared as a Mastra `Tool` object inside `simplerdevelopment-agents/`. Rejected: duplicates ~400 tool definitions; immediately drifts from `lib/mcp/` as the portal evolves; breaks the single-source-of-truth rule for portal tools; the per-tool maintenance burden eliminates the portability benefit of the framework move.

**Alternative B — Keep the hand-rolled Anthropic SDK loop:** Extend `app/api/portal/brain/agent/route.ts` directly rather than adopting a framework. Rejected for the Mastra example: the hand-rolled loop offers no Mastra Studio visibility, no structured-output validation via `structuredOutput`, and no straightforward provider swap. The existing route remains in place and continues to serve the app — this ADR covers the framework layer only, not a forced replacement.

## Addendum — Portal AI assistant added (2026-06-25)

The package now contains a second agent: the **Portal AI assistant**, a Mastra rebuild of the parent's `app/api/portal/ai/chat/` + `lib/ai/portal-tools/` path.

**Files:**
- `simplerdevelopment-agents/src/mastra/agents/portal-assistant.ts` — the dynamic Agent
- `simplerdevelopment-agents/src/mastra/agents/portal-intent.ts` — `classifyPortalIntent()` classifier (returns `{ complexity, domains }`)
- `simplerdevelopment-agents/src/run-portal.ts` — standalone runner

**Key design difference from the Brain agent — dynamic agent via `requestContext`:**

The Portal assistant uses a Mastra **dynamic agent** pattern. Rather than a fixed model and tool set, both are functions of Mastra's `requestContext` evaluated at inference time:

- `classifyPortalIntent` (fast Haiku pre-step, defined in `portal-intent.ts`) runs first and returns `{ complexity, domains }`.
- `complexity` routes the model: Haiku for simple requests, Sonnet for complex ones — mirroring `lib/ai/portal-tools/classifier.ts` in the parent app.
- `domains` narrows which SD MCP tools are exposed: tool names are prefix-filtered against the resolved domain list so the model sees only the relevant subset of the portal surface.

This contrasts with the Brain agent, which uses a **deterministic Workflow** (`brain-workflow.ts`) with fixed stage order and static tool exposure. Together the two agents demonstrate complementary Mastra shapes within the same package:

| Agent | Mastra shape | Model routing | Tool exposure |
|---|---|---|---|
| Brain | Workflow + fixed stage Agents | Haiku stages / Sonnet tool-loop (hardcoded per stage) | Full brain-scoped MCP tool list |
| Portal assistant | Dynamic Agent (`requestContext`) | Haiku or Sonnet per-request (classifier-driven) | Domain-narrowed MCP subset per-request |

**Shared MCP connection — "two agents, one MCP":** Both agents consume the same `MCPClient` instance from `simplerdevelopment-agents/src/mastra/mcp/sd-mcp.ts`. The tool filtering happens client-side (prefix matching on the result of `MCPClient.listTools()`) — not by minting separate API keys or MCP sessions per agent.

**Status:** `tsc --noEmit` clean; `mastra build` succeeds. Standalone package, not yet wired into the Next runtime. No change to Project Board lane (still Validating).

## Related

- Domain map: [[Company Brain & AI]]
- Architecture: [[MCP Server]] · [[Building Custom Agents — Principles]]
- Related ADR: [[ADR agent-topology-router-not-domain-mesh]]
- Package: `simplerdevelopment-agents/` (sibling to the main monorepo app)
- Adoption guide: `simplerdevelopment-agents/BRAIN_AGENT_README.md`
