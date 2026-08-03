---
name: sd-run-flow
description: "Execute a SimplerDevelopment Workflow Designer agent flow — fetch the saved graph from the portal and actually run it, dispatching each node to its Claude Code persona subagent in graph order, pausing at human-in-the-loop nodes, and reporting live progress to the portal's Executions tab as it goes. Use when the user says 'run flow', 'execute the workflow', 'run the agent flow for project X', '/sd-run-flow', 'run the QA pipeline flow', or names a flow they built in the Workflow Designer canvas. Does not edit flows: it runs them and reports progress."
argument-hint: "<projectId> [flowId] [cardId]"
allowed-tools: Agent, AskUserQuestion, Read, Grep, Glob, Bash
user-invocable: true
---

# sd-run-flow — execute a Workflow Designer flow

The Workflow Designer (`/portal/projects/<id>?tab=flow`) stores an agent
pipeline as a graph. It has **no server-side runtime** — the graph is a
specification, nothing executes it. This skill is the runtime, running in
Claude Code.

That works because the graph was designed against Claude Code's own subagents:
`lib/agent-flows/types.ts` defines `PERSONA_SLUGS` as *"filenames in
`.claude/agents/` minus `.md`"*. So `node.data.agentType` **is** a
`subagent_type`. Nothing needs translating.

## Field mapping

| Graph field | Use as |
|---|---|
| `data.agentType` | `subagent_type` for the Agent tool |
| `data.prompt` | the agent's prompt (verbatim — the author wrote it for this) |
| `data.model` | `model` override: `opus` / `sonnet` / `haiku` |
| `data.label` / `data.role` | the agent's `description` label |
| `data.entryPoint` | where the run starts |
| `data.fanOut` | `'all'` = follow every outgoing edge; `'one'` = take exactly one |
| `data.kind` | `agent` = dispatch · `step` = inline · `human` = STOP · `flow` = run a sub-flow |
| `data.flowId` | target flow for a `flow` node (sub-flow handoff) |
| `data.assigneeIds` | project-member user ids who must sign off (human nodes) |
| edge `kind` | `dependency` = target waits for source; `handoff` = sequence |
| edge `label` | the branch's meaning — becomes the choice text under `fanOut: 'one'` |

## Steps

### 1. Resolve the flow

```
agent_flows_list({ projectId })
```

If `flowId` was given, use it. If the project has exactly one flow, use that.
Otherwise show the list (name, status, node/edge counts) and ask which.

Prefer `status: 'active'` flows; warn before running an `archived` one.

```
agent_flows_get({ projectId, flowId })
```

### 2. Plan before running anything

Build the execution order and **show it to the user before dispatching a
single agent**. A flow can fan out across many Opus subagents; the user sees
the cost before it is spent, not after.

- Start at the node(s) with `entryPoint: true`. If none, start at nodes with
  no incoming edges. If still none (every node has an inbound edge — the
  graph is one big cycle), stop and say so.
- Follow edges forward. A node with `kind: 'dependency'` inbound edges waits
  until **all** of those sources are done.
- **Cycles are legal and expected.** Rework loops (`Code Reviewer → Backend
  Engineer`, labelled "changes requested") are a normal way to draw a flow.
  Do not topologically sort and give up — instead cap each node at **3
  executions per run** and tell the user when a cap is hit. Never loop
  unbounded.

Print the plan as an ordered list: step, node label, persona, model, and
whether it runs in parallel with its siblings.

#### Check that nothing verifies its own work

While building the plan, look for any node that **verifies** upstream work —
reviews, QA, audits, security checks, "confirm X", gates — and compare its
`agentType` with the `agentType` of every node with an edge into it.

**If they match, stop and ask before dispatching.** An agent grading its own
output is not verification: the same reasoning that produced a mistake
produces a proof of the mistake. It is the one failure this pipeline cannot
catch on its own, because the run goes green.

Judge "verifies" from the node's **label, role and prompt**, not from the
persona alone. That judgement is the reason this check lives here rather than
in the API — a route handler sees only `agentType`, so it cannot tell a
genuine review step from two sequential build steps, and would have to either
reject legitimate flows or miss the real ones. You can read the prompt.

Two nodes sharing a persona is not itself a problem: `backend-engineer` →
`backend-engineer` as "scaffold" then "wire it up" is a normal pipeline. Only
flag it when the second node's job is to *check* the first.

When you find one, use `AskUserQuestion` — do not silently proceed, and do not
silently swap the persona yourself:

- name the two nodes and the shared persona;
- offer a genuinely independent reviewer (`adversarial-reviewer` and
  `code-reviewer` exist for this; `security-engineer` for auth/tenancy/billing
  paths);
- offer "run it as drawn" as an explicit choice, since the author may have
  meant it.

Record the outcome on the run once it opens, whichever way it goes:

```
agent_flow_runs_event({ runId, type: 'note',
                        summary: 'Self-review: <node> reviewed by same persona
                                  as <upstream> — substituted X / ran as drawn' })
```

A different **persona** satisfies independence here. Do not also flag a shared
`model` — nearly every node runs on the same tier, so flagging that would fire
on every flow and teach everyone to click through the warning.

### 3. Open the execution

```
agent_flow_runs_start({ projectId, flowId })   → { runId }
```

Do this **before** dispatching anything. It snapshots the graph and makes the
run visible in the portal's **Executions** tab, which updates live over SSE
with no reload. Tell the user the run is trackable there.

**If this run is doing the work of a Kanban card, link it to that card now:**

```
kanban_card_artifact_link({ cardId, artifactType: 'agent_flow_run',
                            artifactId: runId })
```

Link at **start**, not at close — a card that shows its run only after the
run finishes can't tell you what is happening right now, which is the point.

This is the provenance edge, and it is the only thing that connects what a
card cost to what an agent spent: the run carries `model`, token counts and
duration per node; `kanban_card_log_time` carries the human minutes. Nothing
else joins those two halves, so a run that goes unlinked is work nobody can
account for later. If the user named a card, or you moved one into In
Progress for this work, link it. If genuinely no card applies (an ad-hoc
exploration), skip it — don't invent one.

From here on, **report every transition** — the portal only knows what you
tell it, and a run that executes silently looks abandoned:

```
agent_flow_runs_event({ runId, type: 'node.status', nodeId, status: 'started' })
agent_flow_runs_event({ runId, type: 'node.status', nodeId, status: 'finished',
                        summary, model, inputTokens, outputTokens, durationMs })
```

Rules that keep the portal honest:

- **Report `started` before dispatching**, `finished` after. A node that only
  reports on completion shows as pending while it is actually running, which
  defeats the point.
- **Report `skipped`** for every untaken branch and every node a cap stopped.
  Silence reads as "still pending" forever.
- **Report `failed`** with the error in `summary` — do not just stop.
- **Include `model`, token counts and `durationMs`** on finish. The canvas
  shows cost per step from these, and a node that ran on a different tier than
  the graph declared is a real discrepancy worth surfacing.
- `summary` is capped at 2KB server-side. Send a short outcome, not the
  agent's full output.
- Use `type: 'note'` for anything the user should see that isn't a node
  transition (a branch choice, a cap being hit, a gate result).

### 4. Execute

Walk the plan.

**`kind: 'agent'`** → dispatch:

```
Agent(
  subagent_type: <data.agentType>,
  model: <data.model>,
  description: <data.label>,
  prompt: <data.prompt>  + accumulated context from upstream nodes
)
```

Pass upstream results forward — a node's inputs are the outputs of every node
with an edge into it. Without that the flow is just a list, not a pipeline.

Siblings under `fanOut: 'all'` are independent: dispatch them **in a single
message** so they run concurrently.

**`kind: 'step'`** → no subagent. Do the work inline yourself, using
`data.description` / `data.prompt` as the instruction. These are usually
gates ("run the tests") — actually run them.

**`kind: 'human'`** → **STOP. Do not proceed past this node on your own.**

First publish it, so the portal shows the run as waiting rather than silently
stalled — this is the one state a person actually needs surfaced:

```
agent_flow_runs_event({ runId, type: 'run.waiting', nodeId,
                        summary: 'Waiting on <names>' })
```

- Resolve `assigneeIds` to names via `project_members_list({ projectId })`.
- If the current user is among the assignees, ask them directly with
  `AskUserQuestion` — include `data.prompt` (the review instructions) and a
  summary of what upstream nodes produced.
- If they are **not** an assignee, say who the flow is waiting on and stop.
  Do not approve on someone else's behalf, and do not treat silence as
  approval.

**`kind: 'flow'`** → hand off to another flow. Start a child run, passing this
run as the parent so the portal renders the handoff as a tree:

```
agent_flow_runs_start({ projectId, flowId: <node's data.flowId>,
                        parentRunId: runId, parentNodeId: <this node's id> })
```

Then run that flow's graph to completion and only afterwards mark this node
`finished`. The call **blocks** — a `flow` node with no outgoing edges is
therefore a tail-call, which is why there is no separate handoff mode.

The server enforces a nesting depth cap and rejects a flow that is already
running further up the chain, so an A→B→A cycle fails fast rather than
spawning runs until something breaks. If a start is rejected, report the node
`failed` with the reason. Do not retry it.

**`fanOut: 'one'`** → the outgoing edge labels are the options. Ask the user
with `AskUserQuestion` which branch to take, then follow only that edge.
Edge labels are free text, so there is nothing to evaluate automatically —
never guess a branch.

### 5. Close the run

Always finish, on every path including failure:

```
agent_flow_runs_event({ runId, type: 'run.finished',
                        status: 'succeeded' | 'failed' | 'abandoned' })
```

Use `abandoned` when you stop without reaching a terminal node (the user
redirected, a blocker halted it). It is **not** a failure — it means nobody is
driving this run any more, and the portal styles it differently for that
reason. A run you never close shows as running forever.

### 6. Report

Summarise: which nodes ran, what each produced, where it stopped, and
anything skipped (an untaken branch, a node that hit the 3-execution cap).
Name skipped work explicitly — a silent skip reads as "covered everything".

## Rules

- **Read-only against the portal.** Run the flow; never edit it. There are no
  agent-flow write tools over MCP by design — authoring belongs in the canvas.
- **Never invent nodes.** Run the graph as drawn. If it is broken (dangling
  edge, no entry point, unknown persona), say so and stop rather than
  patching around it.
- **`data.prompt` is the author's text.** Pass it through. Add upstream
  context around it; don't rewrite it.
- **A node with no prompt** still runs — fall back to `label` + `role` as the
  instruction, and note the prompt was empty.
- **Respect the gates the flow declares.** If a step node says
  `bun test:tenancy`, run it and honour the result; don't declare success
  over a red gate.
- Prefer the `Agent` tool. Only reach for the `Workflow` tool if the user
  explicitly asks for that scale — it is far more expensive.

## Failure modes worth naming

- **Unknown `agentType`** — a persona was renamed or removed from
  `.claude/agents/`. Stop; the graph is stale. Do not substitute a
  "similar" agent.
- **No entry point and no source node** — the graph is a closed cycle.
  Ask which node to start from.
- **Empty graph** — nothing to do; say so rather than reporting success.
