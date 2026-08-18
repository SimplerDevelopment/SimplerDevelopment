---
type: adr
domain: projects-pm
status: accepted
date: 2026-07-18
---

# ADR: Path Visualizations — agent-declared truth + advisory claims

## Context

Path Visualizations ("Dev Paths") renders live node-graph charts of development
paths (screens/components/APIs/schema/services/tests/jobs/infra) attached 1:N to
portal projects, authored by coding agents via MCP while they build in a target
repo the portal cannot see. Two foundational calls needed deciding: where the
chart's truth comes from, and how cross-agent coordination on overlapping
files/nodes is enforced. Spec: [[Path Visualizations]].

## Decision 1 — agent-declared truth (not code-derived)

The agent working in the target repo is the author: it declares nodes, edges,
statuses, and metadata via the `pathviz_*` MCP tools. The portal never parses
code. Nodes carry optional `filePath`/`routePath` refs so claims are checkable,
and `last_verified_at` is reserved for a future audit pass that diffs
declarations against real code.

**Why:** works for ANY repo an agent can open (client codebases included) with
zero code-analysis infrastructure; captures in-flight work (the narrative), not
just what exists; and the declared mental model is precisely what makes the
chart a coding-with-agents coordination surface. Rejected: static analysis
(large per-framework build, portal-side repo access, loses the in-flight
story); hybrid verify-on-write (deferred, schema-ready).

**Consequence:** charts can drift from code if agents stop updating them. The
mitigation is workflow (tool descriptions bake the declare→touch→status→release
loop into the agent contract) plus the reserved audit pass — not enforcement.

## Decision 2 — claims are advisory (warn, never block)

`pathviz_claim` creates soft file/node leases (TTL 30 min, refreshed by
presence touches, explicit release). Overlap with another agent's active claim
— same node or intersecting file paths, checked across ALL charts in the
project — returns a warning carrying the holder's intent, files, and recent
notes, and emits a `conflict` event (CONTESTED in the UI). It never denies.
User-confirmed 2026-07-18.

**Why:** cooperative agents negotiate (the claim response + `pathviz_note`
thread IS the handshake); hard locks deadlock on crashed agents and forbid the
useful "build against a mock while waiting" pattern; every contest is visible
live and recorded/replayable in the event log. A per-project `enforceClaims`
hard mode remains a compatible later addition (schema identical either way).

## Supporting choices (recorded, not re-argued)

- **Event log is triple-duty**: `path_chart_events` feeds SSE (id = cursor),
  audit, and the replay scrubber; one pure client reducer serves live + replay.
- **Reuse `projects:read/write` scopes** (charts are project sub-resources —
  same call kanban made); tenancy inherited via `project_id → projects.client_id`.
- **Cross-tenant chart reads 404** (existence non-leak; contacts/tickets
  precedent) — deliberate deviation from the artifacts route's 403.
- **Manual migration** (`drizzle/9013_pathviz_manual.sql`): db:generate is
  blocked by the pre-existing journal drift; additive guarded SQL per the
  9004–9012 convention.

## Related

[[Path Visualizations]] · [[Projects, Tickets & Kanban]] · mockups under
`docs/design/path-visualizations-mockup*.html`
