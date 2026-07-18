# Company Brain Agent — Architecture Guide

`POST /api/portal/brain/agent` — SSE streaming agentic endpoint.

This document maps to `brain-agent-architecture.excalidraw`. Read them together.

---

## Overview

Every request passes through three cheap Haiku checks that bracket one expensive variable loop:

```
Classify (Haiku) → [Plan (Haiku, complex only)] → Tool Loop (Haiku or Sonnet) → Groundedness (Haiku)
```

The pre- and post-loop steps always use the smallest model and run against a forced `tool_choice` so they can't ramble — they call a structured tool and return. The loop uses whichever model the classifier selected.

---

## Stage 0 — Entry Gates (before the stream opens)

**Code:** `app/api/portal/brain/agent/route.ts`, lines 108–198

Four checks happen synchronously before the `ReadableStream` is created. If any gate fails, the response is a regular JSON error — no SSE involved.

| Gate | What it checks | Failure code |
|------|---------------|--------------|
| `requireBrainEntitlement` | Session cookie or Bearer token is valid; Brain feature is enabled for this client; staff (admin/employee) are allowed (contrast: `/ai/chat` blocks staff) | 401 |
| Body parsing | `message` is a non-empty string; `conversationId` is a number if provided | 400 |
| Plan gate + BYOK | Client's subscription permits Brain; if using platform key, credit balance > 0 | 402 |
| Conversation setup | If `conversationId` supplied, verifies it belongs to this client; otherwise creates a new `aiConversations` row. User message is persisted to `aiMessages` **before the stream starts** so a mid-stream disconnect doesn't lose it. | 404 |

The Anthropic client is instantiated here using whichever key won: client BYOK > platform key. Credits are only deducted for platform-key calls.

---

## Stage 1 — Classify Intent (pre-loop, always runs)

**Code:** `lib/ai/brain-tools/classifier.ts`
**SSE frame emitted:** `{ type: 'intent', intent, complexity, reasoning }`

Haiku is called with `tool_choice: { type: 'tool', name: 'classify' }` — the model is forced to call the classify tool and cannot produce free text. This makes it deterministic, fast (~100ms), and cheap.

**Intent categories:**
- `lookup` — retrieve existing knowledge
- `capture` — create or record new info
- `planning` — OKR, initiatives, goals
- `people` — find experts, org chart, who-knows
- `procedural` — playbook, process, runbook
- `summary` — dashboard, overview, status

**Complexity:**
- `simple` — a single tool call can answer it → loop uses **Haiku**
- `complex` — multiple tool calls or cross-entity reasoning → loop uses **Sonnet**

The intent is also fire-and-forget tracked in `agent_preferences` (long-term usage memory) via `trackIntentUsage()`.

---

## Stage 2 — Generate Plan (pre-loop, complex queries only)

**Code:** `lib/ai/brain-tools/planner.ts`
**SSE frame emitted:** `{ type: 'plan', steps: [{ action, tool, reasoning }] }`

Only runs when `classification.complexity === 'complex'`. Same Haiku + forced tool_choice pattern. Produces 2–5 ordered steps, each specifying which brain tool to call and why. The plan is appended to the system prompt as a `## Your plan for this query` section so the main loop model can follow it.

**Example output:**
```json
{
  "steps": [
    { "action": "Search for Q1 decisions", "tool": "brain_list_decisions", "reasoning": "Need Q1 decision log first" },
    { "action": "Search for Q2 decisions", "tool": "brain_list_decisions", "reasoning": "Need Q2 for comparison" },
    { "action": "Synthesize patterns", "tool": "brain_search", "reasoning": "Cross-reference for themes" }
  ]
}
```

---

## Stage 3 — Agentic Tool Loop (the core)

**Code:** `app/api/portal/brain/agent/route.ts`, lines 315–502
**SSE frames emitted:** `tool_start`, `tool_end`, `token`

The loop runs up to **MAX_LOOPS = 8** iterations with a global cap of **MAX_TOOL_CALLS = 20**. It alternates between two Anthropic call strategies:

### Turn 1: `messages.create()` (non-streaming)

The first turn always uses the blocking `create()` call. This matters because SSE frames must be emitted in the right order — if the first response is a tool call, we don't want to emit partial tokens before the tool results come back. The non-streaming call gives us a clean `stop_reason` before touching the SSE stream.

**Branching on `stop_reason`:**

- **`tool_use`** → extract `ToolUseBlock[]`, execute each one sequentially, append `tool_result` blocks to the message list, loop back.
- **`end_turn`** → the model answered directly (no tools needed). Emit the text as a single `token` frame and break.

### Turn N+: `messages.stream()` (streaming)

Once tool results are in the message list, subsequent turns use the streaming SDK. Text delta events become `token` frames immediately so the client sees the answer build character-by-character. If the model requests another tool call mid-stream (rare but possible), streaming continues until `stop_reason === 'tool_use'`, then tool execution happens again before the next streaming turn.

### Tool execution: `executeBrainTool()`

**Code:** `lib/ai/brain-tools/index.ts`

Every tool call passes through two deterministic hooks regardless of what the LLM requested:

**Hook 1 — `sanitizeToolResult()`** (`lib/ai/brain-tools/sanitizer.ts`)
Runs 8 regex patterns over the JSON-stringified result before it enters the LLM's context window:

| Pattern | Replacement |
|---------|------------|
| `sk-[A-Za-z0-9-_]{20,}` | `[REDACTED_API_KEY]` |
| `Bearer [A-Za-z0-9-_.]{20,}` | `Bearer [REDACTED_TOKEN]` |
| `ghp_[A-Za-z0-9]{36,}` | `[REDACTED_GH_TOKEN]` |
| `xoxb-[0-9A-Za-z-]{20,}` | `[REDACTED_SLACK_TOKEN]` |
| `"password": "..."` | `"password": "[REDACTED]"` |
| `password='...'` | `password=[REDACTED]` |
| SSN format `\d{3}-\d{2}-\d{4}` | `[REDACTED_SSN]` |
| Credit card numbers (Luhn) | `[REDACTED_CC]` |

This runs on every tool call — it cannot be disabled by the LLM or by the user.

**Hook 2 — `withSpan()`** (`lib/ai/brain-tools/tracer.ts`)
Wraps every tool call and emits a structured JSON line to `console.warn` when it completes:

```json
{
  "span": "brain_tool.brain_search",
  "duration_ms": 142,
  "ok": true,
  "clientId": 7,
  "convId": 381,
  "toolName": "brain_search"
}
```

This is an OTEL-compatible shim — `console.warn` output can be piped to any log aggregator. When `ok: false` is emitted, the `error` field contains the exception message.

The classifier, planner, and grounder are also wrapped: `brain_agent.classify`, `brain_agent.plan`, `brain_agent.groundedness`.

### Loop guards

If either limit is reached before `end_turn`:
- `loopCount >= MAX_LOOPS` → emit `{ type: 'error', message: 'Agent loop limit reached.' }`
- `toolCallCount > MAX_TOOL_CALLS` → emit `{ type: 'error', message: 'Tool call limit exceeded.' }`

---

## The 12 Brain Tools

All tools hit the database directly (no HTTP round-trips) via `lib/brain/*`. Each handler catches errors and returns `{ error: "..." }` so the LLM can reason about failures rather than crashing the loop.

| Tool | What it returns |
|------|----------------|
| `brain_search` | Hybrid full-text + semantic search across notes, tasks, decisions, people, meetings, contacts |
| `brain_dashboard_summary` | Counts: open tasks, active initiatives, at-risk goals, pending reviews, active people, glossary terms |
| `brain_get_note` | Full note by ID including markdown body |
| `brain_create_note` | Creates a note with title, body, tags, pinned flag; source = `ai_review` |
| `brain_list_decisions` | Decision log, filterable by status: proposed / accepted / rejected / superseded |
| `brain_get_decision` | Single decision + its full supersede chain |
| `brain_list_people` | Directory: name, email, title, org unit, status |
| `brain_lookup_glossary` | Exact, prefix, and substring match on glossary terms |
| `brain_list_glossary` | Browse all active terms, filterable by category |
| `brain_list_initiatives` | Strategic multi-quarter efforts with goal counts |
| `brain_list_tasks` | Open tasks, filterable by status; defaults to `open` only |
| `brain_create_task` | Creates a task with title, description, priority, optional due date |

Write tools (`brain_create_note`, `brain_create_task`) are gated by the system prompt: the LLM is instructed to summarize what it's about to create and wait for user confirmation before calling the tool.

---

## Stage 4 — Groundedness Check (post-loop, always runs)

**Code:** `lib/ai/brain-tools/grounder.ts`
**SSE frame emitted:** `{ type: 'confidence', score, grounded, uncertain }`

After `finalText` is assembled, Haiku reviews the answer against all tool results collected during the loop. Same forced-tool pattern: the model calls the `grade` tool and cannot deviate.

**Output fields:**
- `confidence` — 0.0 to 1.0, how well the answer is supported by retrieved data
- `grounded` — `true` if every major claim appears in the tool results
- `sources` — list of IDs or titles from tool results that were cited
- `uncertain` — `true` when `confidence < 0.5`

**When `uncertain === true`:** The final answer is prepended with *"I don't have enough reliable information in the Company Brain to answer this with confidence."* This prefix is written into `finalText` before it's persisted to the DB, so the caveat appears in conversation history too.

The UI renders the confidence as a 5-dot color-coded bar: green (≥ 0.70), amber (≥ 0.50), red (below).

---

## Stage 5 — Finalize

After the loop and grounder complete, `finalize()` runs regardless of success or error (it's idempotent — it cannot run twice).

**In order:**
1. Persist assistant message to `aiMessages` (role, content, toolCalls JSON, token counts)
2. Update `aiConversations.totalInputTokens`, `totalOutputTokens`, `updatedAt`
3. If platform key: `deductCredits()` based on total token usage
4. `recordAiUsage()` — audit trail (fire-and-forget)
5. Emit `{ type: 'done', conversationId, tokensUsed }` — the client uses `conversationId` for subsequent turns
6. `controller.close()` — stream ends

If `finalize(errMessage)` is called with an error message, an `{ type: 'error', message }` frame is emitted before the `done` frame.

---

## SSE Frame Sequence

Frames arrive in this order for a typical complex query:

```
data: {"type":"intent","intent":"lookup","complexity":"complex","reasoning":"..."}

data: {"type":"plan","steps":[...]}

data: {"type":"tool_start","name":"brain_list_decisions","label":"Loading decisions..."}
data: {"type":"tool_end","name":"brain_list_decisions"}

data: {"type":"tool_start","name":"brain_search","label":"Searching Brain..."}
data: {"type":"tool_end","name":"brain_search"}

data: {"type":"token","text":"Based"}
data: {"type":"token","text":" on"}
data: {"type":"token","text":" the"}
...

data: {"type":"confidence","score":0.87,"grounded":true,"uncertain":false}

data: {"type":"done","conversationId":381,"tokensUsed":3240}
```

For a simple query: no `plan` frame, no `tool_start`/`tool_end` frames (LLM may answer directly), and `confidence` will still appear.

For an error: `{ type: 'error', message }` appears before `done`. `done` always fires last.

---

## Model Budget

| Component | Model | Always? | Approximate tokens |
|-----------|-------|---------|------------------|
| Classifier | Haiku | Yes | ~200 in / ~50 out |
| Planner | Haiku | Complex only | ~400 in / ~150 out |
| Loop turn (tool) | Haiku or Sonnet | Per turn | ~1000–3000 in / ~500 out |
| Loop turn (final) | Haiku or Sonnet | Once | ~2000–4000 in / ~500 out |
| Grounder | Haiku | Yes | ~800 in / ~100 out |

Simple queries (Haiku throughout, 1–2 tool calls): ~3,000–5,000 tokens total.
Complex queries (Sonnet, 3–5 tool calls): ~8,000–15,000 tokens total.

---

## Files

| File | Role |
|------|------|
| `app/api/portal/brain/agent/route.ts` | Main route: auth, loop, SSE stream |
| `lib/ai/brain-tools/classifier.ts` | Intent classifier |
| `lib/ai/brain-tools/planner.ts` | Plan generator |
| `lib/ai/brain-tools/grounder.ts` | Answer grounder |
| `lib/ai/brain-tools/index.ts` | Tool registry + executor |
| `lib/ai/brain-tools/sanitizer.ts` | PII/secret redaction |
| `lib/ai/brain-tools/tracer.ts` | OTEL-compatible span logger |
| `lib/brain/agent-preferences.ts` | Long-term intent usage memory |
| `components/brain/BrainAgentChat.tsx` | UI: SSE parsing, streaming render |
| `tests/e2e/portal-brain-agent.spec.ts` | E2E test suite (9 tests) |
