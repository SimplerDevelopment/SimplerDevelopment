# SimplerDevelopment agents on Mastra — examples wired to the portal MCP

Worked examples of building agents in **Mastra** and connecting them to the
existing **SimplerDevelopment2026** platform. They rebuild the parent app's
hand-rolled agents (which drive the Anthropic SDK directly) as idiomatic Mastra
primitives, getting their tools by connecting to the portal's **MCP server** as a
client — instead of re-implementing them.

Two agents, **one shared MCP connection** (`src/mastra/mcp/sd-mcp.ts`):

1. **Company Brain agent** — a Mastra **Workflow** (classify → plan → tool-loop →
   ground). Rebuild of `app/api/portal/brain/agent/route.ts`.
2. **Portal AI Assistant** — a Mastra **dynamic agent** (model + tools chosen per
   request from a classifier via `requestContext`). Rebuild of
   `app/api/portal/ai/chat/` + `lib/ai/portal-tools/`.

They deliberately use different Mastra primitives so the example covers more
surface: a deterministic workflow vs. a self-configuring dynamic agent.

> Built via the project's grill-me intake. Decisions: rebuild the Brain agent
> only (deepest pattern), connect over MCP (don't re-implement tools), use
> Anthropic Claude (match the parent), read **+** write with the approval flow.

---

## What it demonstrates

| Mastra primitive | File | Maps to (parent) |
|---|---|---|
| **MCPClient** → portal tools over HTTP | `src/mastra/mcp/sd-mcp.ts` | `lib/mcp/` server + `lib/ai/brain-tools/` |
| **Agent** (tool-loop) | `src/mastra/agents/brain-agent.ts` | `app/api/portal/brain/agent/route.ts` |
| **Agents** w/ structured output (classify / plan / ground) | `src/mastra/agents/brain-stages.ts` | `lib/ai/brain-tools/{classifier,planner,grounder}.ts` |
| **Workflow** orchestration | `src/mastra/workflows/brain-workflow.ts` | the imperative pipeline in the route |
| **Dynamic Agent** (model + tool routing) | `src/mastra/agents/portal-assistant.ts` | `app/api/portal/ai/chat/` |
| Portal intent classifier | `src/mastra/agents/portal-intent.ts` | `lib/ai/portal-tools/classifier.ts` |
| **Scorers** (eval layer) | `src/mastra/scorers/brain-scorer.ts` | `lib/ai/evals/` + the runtime grounder |
| Registration / Studio | `src/mastra/index.ts` | — |
| CLI runners | `src/run-brain.ts`, `src/run-portal.ts` | — |

The pipeline is the same as the parent's:

```
query → classify (intent + complexity)
      → plan (complex queries only)
      → tool-loop Agent  ← pulls brain_* tools from the SD MCP server
      → groundedness check (a 2nd model grades the answer)
      → { answer, intent, plan, groundedness }
```

## The key idea: connect, don't re-implement

The SimplerDevelopment portal already exposes ~400 tools over MCP. The agent's
tools are loaded live from that server:

```ts
// src/mastra/agents/brain-agent.ts
tools: async () => await sdTools(),   // → MCPClient.listTools() over HTTP
```

`sdTools()` (`src/mastra/mcp/sd-mcp.ts`) is an `MCPClient` pointed at
`POST $SD_MCP_URL` with an `Authorization: Bearer sd_mcp_…` header. The tool
catalogue you get back is **scoped to the key** — a `brain:read` key yields only
the brain read tools. Writes (e.g. `brain_create_note`) route through the
portal's approval flow and return an approval URL rather than mutating.

---

## Setup

### 1. Add your Anthropic key

This example uses Claude to match the parent app. In `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Run the parent app + mint a portal API key

The agent talks to the parent Next app's MCP endpoint, so that app must be
running with its Postgres up.

**Start it** (from the monorepo root, one level up):

```bash
cd ..            # the simplerdevelopment2026 app root
bun dev          # serves http://localhost:3000  → MCP at /api/mcp
```

**Mint a key** — two ways:

- **UI:** open `http://localhost:3000/portal/settings/api-keys` → *New key* →
  uncheck "Full access" → under **Company Brain** check `brain:read` and
  `brain:write` → generate, and copy the `sd_mcp_…` value (shown once).
  _(Backed by `app/api/portal/api-keys/route.ts` → `generatePortalApiKey()`.)_

- **CLI seed (full-access dev shortcut):**
  ```bash
  cd ..
  export DATABASE_URL=postgresql://localhost:5432/simplerdev_local_20260514
  bun scripts/smoke-sd-skills.ts seed-key      # prints an sd_mcp_… key
  ```

### 3. Wire the key into this package's `.env`

```
SD_MCP_URL=http://localhost:3000/api/mcp
SD_MCP_API_KEY=sd_mcp_xxxxxxxx...
```

---

## Run it

**CLI — Brain (workflow):**

```bash
bun run src/run-brain.ts "who knows about Stripe billing?"
```

**CLI — Portal assistant (dynamic agent):**

```bash
bun run src/run-portal.ts "what invoices are overdue?"
# prints the routing decision (complexity + domains), then the answer.
# Watch how the tool set narrows to just the classified domains.
```

**Mastra Studio** (visual — chat with the agent, inspect each tool call + the
workflow graph, see the connected MCP server's tools):

```bash
bun dev          # this package: mastra dev → http://localhost:4111
```

In Studio you'll find the `brainWorkflow`, the `brain-agent`, the three stage
agents, and (when a key is set) the `simplerdev` MCP server with its tools.

> Without `SD_MCP_API_KEY` the agent still loads, but invoking it throws a clear
> "no tools — mint a key" error. That's intentional: the package builds and the
> stage agents run without the parent app; only the tool-loop needs the MCP.

---

## Eval layer (scorers)

Both agents attach Mastra **scorers** (`src/mastra/scorers/brain-scorer.ts`) that
grade a sample of runs and surface in Studio — the "are my changes actually
better?" loop, separate from the runtime grounder gate:

- **Tool Grounding** (code) — scores 0 if the agent answered with zero tool calls.
- **Answer Groundedness** (LLM judge, Haiku) — is the answer supported by the
  tools it used, or invented / over-hedged? Sampled at 50%.

Run an agent in Studio or via the CLI and the scores show up under the run's
trace. Tune sampling `rate` in each agent's `scorers` block.

## How this would land in the parent project

The parent's brain route (`app/api/portal/brain/agent/route.ts`) hand-rolls the
classify→plan→loop→ground loop against the Anthropic SDK. The adoption path:

1. Run this Mastra app as a sibling service; the Next route calls its workflow
   (HTTP) instead of looping in-process.
2. Or import `@mastra/core` directly into the Next app and replace the route's
   body with `mastra.getWorkflow('brainWorkflow')`.

Either way the **tools stay in one place** — the existing `lib/mcp/` server —
and the agent is a thin, observable, swappable client. See the ADR in
`vault/` for the decision record.

## Config knobs

| env | default | purpose |
|---|---|---|
| `SD_MCP_URL` | `http://localhost:3000/api/mcp` | portal MCP endpoint |
| `SD_MCP_API_KEY` | _(unset)_ | `sd_mcp_…` portal key (scoped) |
| `ANTHROPIC_API_KEY` | _(unset)_ | required — Claude provider |
| `SD_BRAIN_MODEL` | `anthropic/claude-sonnet-4-6` | tool-loop model |
| `SD_BRAIN_FAST_MODEL` | `anthropic/claude-haiku-4-5` | classify/plan/ground model |
