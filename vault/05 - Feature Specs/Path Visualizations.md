---
type: feature-spec
domain: projects-pm
status: Planned
date: 2026-07-18
sku-prefix: PVIZ
sources:
  - lib/db/schema/pm.ts
  - lib/mcp/tools/projects.ts
  - lib/mcp/tools/kanban.ts
  - lib/chat/realtime.ts
  - app/api/admin/agentic-os/runs/[id]/stream/route.ts
  - app/portal/automations/workflows/[id]/page.tsx
  - app/portal/projects/[id]/[[...card]]/page.tsx
  - lib/surveys/flow-diagram.ts
---

# Path Visualizations

Live, agent-authored node-graph charts of **UI paths under construction** in a React/Next.js app, attached 1:N to portal projects. Coding agents working in the target repo declare and update the graph via MCP as they build; the portal renders it as an animated "mission control" view that project members (clients included) can watch update in real time — and replay.

This is a *coding-with-agents visualizer*: the chart is the agent's declared mental model of the UI territory it's working, kept current because updating it is part of the agent's working loop.

## Decisions (grilled 2026-07-18, all branches resolved)

| # | Branch | Decision |
|---|---|---|
| 1 | Node semantics | Top-level nodes are **screens/routes** in a flow; each screen may contain **component** child nodes (optional depth per chart). External calls attach to whichever node makes them, rendered as **service** satellite nodes. |
| 1b | Node "state" | Two-part: a **build-status enum** (drives color/animation) + an agent-declared **metadata block** (React state held, stores, props, calls, tests) shown in a click-to-open inspector. |
| 2 | Source of truth | **Agent-declared via MCP.** Nodes carry optional `filePath`/`routePath` refs so claims are checkable; the portal never parses code. `lastVerifiedAt` reserved for a future audit pass. |
| 3 | Liveness | **SSE push** (~1s) via Postgres NOTIFY → EventSource, plus **ephemeral agent-presence pulses** from a cheap `pathviz_touch` heartbeat tool — the UI shows a glowing beacon on the node the agent is working. |
| 4 | Audience | **Client-visible, read-only.** Anyone with project access (existing `project_members` roles; staff implicit). All writes are MCP-only. |
| 5 | Lifecycle | MCP-created; archive-only delete; every mutation appends to a `path_chart_events` log (SSE feed + audit + replay source). `path_chart` added to the shared artifact-type vocabulary so cards/projects can pin charts. |
| 6 | Visual direction | **Mission-control dark theme on ReactFlow 11** (already installed, proven in the automations builder) — custom glass nodes, framer-motion status transitions, particle-flow edges, GSAP presence beacons. No new dependencies. |
| 7 | V1 scope | Core **plus the replay scrubber** (timeline replay of `path_chart_events`). Deferred: static-analysis verification, runtime telemetry, human editing, per-chart visibility toggles, CMS embed block. |

## Data model (additions to `lib/db/schema/pm.ts`)

Tenancy is inherited via `projectId → projects.clientId` (same as all PM satellites). All FKs `onDelete: 'cascade'` except where noted.

### `path_charts`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `projectId` | int FK → projects | cascade |
| `title` | varchar(200) | |
| `description` | text nullable | |
| `appLabel` | varchar(120) nullable | which app/repo this chart maps (free text, e.g. `acme-storefront`) |
| `status` | enum `active` / `archived` | archive-only delete |
| `createdByAgent` | varchar(120) nullable | agent label from MCP context |
| `createdAt` / `updatedAt` | timestamps | |

Indexes: `(projectId, status)`, `(projectId, updatedAt)`.

### `path_chart_nodes`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `chartId` | int FK → path_charts | cascade |
| `key` | varchar(120) | **stable agent-assigned key** — agents address nodes by key, enabling batch upsert. Unique per chart. |
| `parentNodeId` | int nullable, self-ref | screen ⊃ component containment. App-enforced integrity (no FK — same `parentCardId` precedent, pm.ts) |
| `kind` | enum `screen` / `component` / `service` | `service` = external call target (API route, third-party) |
| `label` | varchar(200) | display name |
| `routePath` | varchar(300) nullable | e.g. `/checkout/payment` (screens) |
| `filePath` | varchar(500) nullable | claim-checkable code ref |
| `status` | enum `planned` / `scaffolded` / `wired` / `styled` / `tested` / `shipped` / `blocked` / `error` | drives visuals |
| `meta` | jsonb | declared state: `{ state, stores, props, calls, tests, notes }` — free-shape, inspector renders known keys |
| `position` | jsonb nullable | `{x,y}` agent override; null = auto-layout |
| `lastVerifiedAt` | timestamp nullable | reserved for future audit pass |
| `createdAt` / `updatedAt` | timestamps | |

Unique index `(chartId, key)`; index `(chartId, parentNodeId)`.

### `path_chart_edges`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `chartId` | int FK → path_charts | cascade |
| `sourceNodeId` / `targetNodeId` | int FK → path_chart_nodes | cascade |
| `kind` | enum `nav` / `data` | `nav` = user navigation between screens; `data` = node → service call |
| `label` | varchar(120) nullable | e.g. "on submit", "POST" |
| `meta` | jsonb nullable | |
| `createdAt` | timestamp | |

Unique index `(chartId, sourceNodeId, targetNodeId, kind)`.

### `path_chart_events`
Append-only log. **Triple duty: SSE feed, audit trail, replay source.**

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | monotonic — doubles as SSE `Last-Event-ID` cursor |
| `chartId` | int FK → path_charts | cascade |
| `eventType` | varchar(50) | `chart.created`, `chart.updated`, `chart.archived`, `node.upserted`, `node.status`, `node.removed`, `edge.upserted`, `edge.removed`, `agent.touch` |
| `payload` | jsonb | enough to apply the event to a client-side graph reducer without refetch |
| `agentLabel` | varchar(120) nullable | |
| `createdAt` | timestamp | |

Index `(chartId, id)`.

`agent.touch` heartbeats ARE persisted (they make replay show the agent moving through the graph). ponytail: unbounded event log — add a prune cron for `agent.touch` rows older than 30d when volume matters.

## MCP tools (`lib/mcp/tools/pathviz.ts`)

Scopes: reuse **`projects:read` / `projects:write`** (charts are project sub-resources — same choice kanban made). Registrar pattern per `lib/mcp/CLAUDE.md`: register-time `hasScope` + in-handler `requireScope`, Zod schemas, `authorizeProjectForClient`-style ownership check, `revalidateForWrite('portal')` after writes, slim `json()` echoes. Lockstep: add to `allToolRegistrars` in `lib/mcp/tools/index.ts` **and** `EXPECTED_TOOLS` in `tests/unit/mcp-tool-registry-baseline.test.ts`.

| Tool | Scope | Purpose |
|---|---|---|
| `pathviz_list_charts` | read | charts for a project (id, title, status, node/edge counts, lastEventAt) |
| `pathviz_get_chart` | read | full graph: chart + nodes + edges (the agent's "load my map" call) |
| `pathviz_create_chart` | write | `{projectId, title, description?, appLabel?}` |
| `pathviz_update_chart` | write | title/description/status (archive via `status:'archived'`) |
| `pathviz_upsert_nodes` | write | **batch** upsert by `key` — `{chartId, nodes:[{key, kind, label, parentKey?, routePath?, filePath?, status?, meta?, position?}]}`. Agents declare a whole path in one call. |
| `pathviz_upsert_edges` | write | batch by `(sourceKey, targetKey, kind)` |
| `pathviz_set_status` | write | hot path: `{chartId, updates:[{key, status, note?}]}` — cheapest possible status flip |
| `pathviz_remove` | write | `{chartId, nodeKeys?, edgeIds?}` — prunes nodes (+ their edges) |
| `pathviz_touch` | write | presence heartbeat `{chartId, nodeKey, action?}` — ultra-slim response (`{ok:true}`), intended every ~10–30s while working a node |

Every write inserts the corresponding `path_chart_events` row(s) and fires `pg_notify('pathviz_chart_<id>', eventId)` in the same transaction path.

**Agent workflow contract** (goes in the tool descriptions): on starting a UI task, `pathviz_get_chart` (or create) → `pathviz_upsert_nodes/edges` to declare the territory → `pathviz_touch` + `pathviz_set_status` as work proceeds → final `pathviz_set_status` (+ meta update with tests/state) when done.

## Portal API (read-only — no portal writes exist)

All NextAuth + `getAuthedProject`-style access check (staff bypass, else `getPortalClient(userId).clientId === project.clientId`), `{ success, data | error }` envelope.

| Route | Purpose |
|---|---|
| `GET /api/portal/projects/[id]/path-charts` | list charts (tab gallery) |
| `GET /api/portal/path-charts/[id]` | full graph snapshot + `lastEventId` (canvas boot) |
| `GET /api/portal/path-charts/[id]/events?since=<id>` | event page — replay data + SSE-reconnect catch-up |
| `GET /api/portal/path-charts/[id]/stream` | SSE. LISTEN on `pathviz_chart_<id>` via a **dedicated `postgres-js` connection** (`max:1, idle_timeout:0` — same isolation rule as `lib/chat/realtime.ts`; never park the Drizzle pool on LISTEN). 15s heartbeat comments, `Last-Event-ID` resume replaying from `path_chart_events`. Modeled on `app/api/portal/chat/inbox-stream` + the agentic-os run stream. |

## UI (`components/portal/pathviz/`, tab at `app/portal/projects/[id]?tab=visualizations`)

Tab registration: one entry in the tabs array + one `activeTab` branch in `app/portal/projects/[id]/[[...card]]/page.tsx`; canvas exported from `dynamic-tabs.tsx` with `ssr:false` (same as KanbanBoard). Material Icons only.

- **`PathVizTab`** — gallery of chart cards: mini static-SVG thumbnail, node-count/status summary bar, **LIVE badge** (pulsing dot when lastEventAt < 2 min). Click → full-screen canvas.
- **`PathChartCanvas`** — ReactFlow 11. Screens render as **group nodes** (RF native `parentNode` + `extent:'parent'`) containing component nodes — containment for free. Zustand store holds graph state; an **event reducer** applies SSE events; the same reducer pure-function powers replay.
- **Custom nodes** — `ScreenNode` (glass card: route chip, status ring, component count), `ComponentNode` (compact), `ServiceNode` (hex/cloud badge with domain, e.g. `stripe.com`).
- **Custom edges** — `NavEdge` (directional animated dash flow), `DataEdge` (**particle stream** along the path when its source node is active/touched — GSAP motion-path on an SVG dot group).
- **`AgentBeacon`** — overlay layer (rAF-throttled, same pattern as visual-editor `PresenceLayer`): GSAP radar-pulse ring + agent-label chip on the last-touched node; TTL 30s then fade.
- **`NodeInspector`** — framer-motion slide-in drawer: status history, declared React state / stores / props, external calls, tests, `filePath`/`routePath` refs.
- **`ReplayScrubber`** — timeline bar with event-density sparkline; play/pause/speed (1×/4×/16×); scrub rebuilds graph state via the reducer folded over `events` up to *t*; **LIVE** button snaps back to streaming. Replay is a UI reducer over data the SSE layer already needs — the disproportionate-wow-for-cost feature.
- **Layout** — auto-layout layered DAG, left→right by `nav` edges, hand-rolled (repo precedent: `lib/surveys/flow-diagram.ts`; **no new layout dep**). `position` overrides win when present. Layout transitions animated via RF node-position interpolation.
- **Animation catalog** — node mount: scale+blur-in; status change: ring sweep + color morph + glow flash; edge add: draw-on path; presence: radar pulse; replay: fast-forward shimmer. All gated by `prefers-reduced-motion`. Palette per the dataviz skill's status-color discipline; canvas is a self-contained dark panel regardless of portal theme (code-editor convention).

## Tests & gates

- Unit: `mcp-tools-pathviz.test.ts` (+ registry baseline update — hard CI gate), event-reducer replay determinism, layout function, portal route auth guards.
- Component: tab gallery + canvas render from a fixture graph.
- E2E: `portal-path-viz.spec.ts` — seed chart via MCP/DB fixture, assert tab render, inspector open, events-endpoint catch-up (SSE itself smoke-tested via the events fallback, not a streaming assertion — flake avoidance).
- **`bun test:tenancy`** after the schema lands (new PM tables need tenancy fixtures in the same PR).
- Migration: edit `pm.ts` → `bun run db:generate` (never hand-edit `drizzle/*.sql`). All-additive → the prod schema-sync workflow auto-applies to metro on merge.
- `bun test:critical` before declaring done.

## Build plan (phased PRs, fan-out cap 3, integrate-as-you-go)

1. **Schema** — 4 tables + enums + tenancy fixtures + migration.
2. **MCP toolset** — `pathviz.ts` registrar + baseline test + unit tests.
3. **Read API + SSE** — 4 portal routes + LISTEN/NOTIFY plumbing.
4. **Tab UI (static)** — gallery + canvas + custom nodes/edges + inspector + auto-layout, rendering a snapshot.
5. **Live layer** — SSE reducer, animation catalog, presence beacons.
6. **Replay scrubber.**
7. **Artifact vocabulary** (`path_chart` in project/card artifact enums + resolver dictionaries) + completion ritual (Domain Map update, ADR for agent-declared-truth decision, Kanban card → Shipped).

## v2 expansion — "Dev Paths" (2026-07-18, mockup-validated, pending final confirmation)

User direction after v1 review: (1) multiple agents on one chart, (2) generalize beyond UI paths to **all development**, (3) use charts for **cross-agent coordination** on overlapping work. Demonstrated in `docs/design/path-visualizations-mockup-v2.html` (three agents, contested-file negotiation, QA fix loop).

### Additional decisions

| Area | Decision |
|---|---|
| Node kinds | Widen enum: `screen` / `component` / `api` / `schema` / `service` / `test` / `job` / `infra` (per-kind card styles; lanes UI/API/Jobs·Infra/Data in layout — v3 mockup). Blocks nothing later — kind is data. |
| Agent identity | Every MCP write carries an agent label (from the MCP connection/OAuth context + optional self-declared session name). Events, history rows, presence, and claims are all agent-attributed. Per-agent presence color from a validated accent family (never color-alone — name chip always attached). |
| Claims (file leases) | New `pathviz_claim` / `pathviz_release`: a claim = node keys + file globs + intent string, TTL ~30 min (refreshed by `pathviz_touch`). **Soft/advisory** — overlapping claims are *warned*, not blocked (user-confirmed 2026-07-18); a hard-enforce mode (claim required before `set_status`) stays available as a per-project toggle later if contests get ignored in practice. |
| Conflict detection | On claim, server checks active claims across **all charts in the project** for node/file overlap (file index on claims). Overlap → `conflict` event on the stream + the claim response returns the other agent's identity, intent, files, and recent notes — that response is the coordination handshake. |
| Agent notes | `pathviz_note({chartId, nodeKey, text})` — threaded notes on nodes, returned in `pathviz_get_chart` and in conflicting-claim responses. The negotiation (who waits, who adapts, interface contracts) is recorded on the node and replayable. |
| Cross-agent workflow contract | Agent loop (in tool descriptions): `get_chart` → `claim` (read warnings; if contested, `note` to negotiate or pick different work) → work (`touch`/`set_status`/`upsert_*`) → `note` any interface change → `release`. |

### Schema deltas (on top of v1)

- `path_chart_nodes.kind`: widen enum (screen/component/api/schema/service/test).
- **`path_chart_claims`**: `id`, `chartId` FK cascade, `nodeId` FK cascade, `agentLabel`, `intent` text, `files` jsonb (paths/globs), `expiresAt`, `releasedAt` nullable, `createdAt`. Indexes: `(chartId, releasedAt)`, GIN on `files`. Active claim = `releasedAt IS NULL AND expiresAt > now()`.
- `path_chart_events.eventType` gains: `claim`, `release`, `conflict`, `note`. `agentLabel` already exists (v1).
- Notes are event-log-only in v1 of v2 (inspector renders from events); promote to a table if they need editing/resolution states.

### MCP deltas

New tools (same registrar/scopes/baseline-test lockstep): `pathviz_claim`, `pathviz_release`, `pathviz_note`, `pathviz_who_owns({files})` (project-wide "who has claims touching these files" — answers the pre-dispatch question directly). Presence/`pathviz_touch` unchanged but response includes any active conflict on the touched node.

### Build-plan impact

Phases 1–3 absorb the schema/tool deltas (claims table lands with Phase 1; claim/note tools with Phase 2; conflict fan-out with Phase 3). Phase 5 gains multi-beacon + claim outlines + contested badge; Phase 4 gains claim/notes inspector sections **plus the project-level "Charts" constellation** (all charts as live cards with status-mix bars + mini-maps; cross-chart file-overlap threads derived from the claims file index) and **zoom LOD** on the canvas (far zoom hides route chips/status words — validated readable at 26 nodes in the v3 mockup). No new phases needed. Mockup lineage: v1 single-agent UI paths → v2 multi-agent coordination → **v3 constellation + density (design reference for Phases 4–6)** — all under `docs/design/`.

## Deferred (explicitly out of v1)

- Audit/verification pass diffing declarations against real code (`lastVerifiedAt` is reserved for it)
- Runtime telemetry from the running target app (SDK — separate product)
- Human chart editing in the portal
- Per-chart client-visibility toggle
- Embedding charts as CMS blocks
- Event-log pruning (ponytail ceiling noted above)

## Related

- [[Projects, Tickets & Kanban]] — parent domain map (update on ship)
- [[Chat, Realtime & Voice]] — LISTEN/NOTIFY + SSE patterns reused here
- `app/portal/automations/workflows/[id]/page.tsx` — ReactFlow precedent (DB-graph ↔ RF translation)
- `components/brain/NoteGraphView.tsx` — force-graph precedent (considered, rejected for path semantics)
