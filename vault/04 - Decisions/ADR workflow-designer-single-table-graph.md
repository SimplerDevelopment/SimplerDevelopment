---
type: adr
domain: projects-pm
status: accepted
date: 2026-08-02
sources:
  - lib/db/schema/agentFlows.ts
  - app/api/portal/projects/[id]/flows/
  - components/portal/AgentFlowTab.tsx
  - lib/db/schema/workflows.ts
---

# ADR: Workflow Designer stores the flow graph as a single jsonb column

## Status
Accepted — 2026-08-02. Tracked on portal project 207 (APWD-003).

## Context
The Workflow Designer is a project-attached, human-editable reactflow canvas for mapping agent/workflow flows. Two prior-art patterns bracketed the design: the merged automations builder (`app/portal/automations/workflows`) stores its design graph as ONE `graph` jsonb column; the unmerged pathviz feature normalizes chart→nodes→edges into three tables. The initial ADR proposed the normalized 3-table model, justified as "execution-ready."

## Decision
Store the whole reactflow graph (nodes + edges + viewport) as a **single `graph` jsonb column** on one `agent_flows` table (projectId + clientId FKs, name, lifecycle status). Scope: **diagram-only** — no execution runtime — but the graph model is execution-ready.

"Execution-ready" does NOT justify normalizing the design graph: the shipping automations feature proves the opposite — it keeps its design graph as one jsonb blob and holds execution state in SEPARATE run tables (`workflow_run_steps`). A future Workflow Designer runtime does the same — it adds its own `agent_flow_runs` tables and reads the `graph` blob; the design table needs no migration.

## Consequences
- Save is a single `UPDATE` (no replace-all transaction, no app-enforced cross-table edge integrity).
- UI lift from the automations builder is ~95% (identical save/load contract).
- `agent_flows.clientId` is denormalized from the owning project and stamped server-side (never from the request body) — the tenant-scoping invariant.
- PUT bounds the graph (413 over 500 nodes/edges or 256KB) and validates `node.agentType ∈ PERSONA_SLUGS` — the one place the feature trusts client input.
- Per-node querying ("which flows use ai-engineer") is harder over a blob — acceptable/YAGNI for a diagram tool.
- Migration `drizzle/9014_agent_flows_manual.sql` is hand-written (the repo's manual escape hatch — `db:generate` is blocked by pre-existing tracker drift); additive, applied to metro at release.

## Alternatives considered
- Normalized 3-table (agent_flows/nodes/edges) — rejected as over-engineered for diagram-only; the automations precedent shows execution state belongs in separate run tables, not a normalized design graph.
- Extending the CRM `workflows` table — rejected: clientId-only, not project-scoped, semantically CRM trigger→action automations.

## Related
- [[Projects, Tickets & Kanban]]
- [[Automations & Workflows]]
- [[ADR role-based-agent-personas]]
