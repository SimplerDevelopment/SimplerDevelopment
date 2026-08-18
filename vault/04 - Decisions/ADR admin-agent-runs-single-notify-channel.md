---
type: adr
domain: agent-flows
status: accepted
date: 2026-08-11
sources:
  - lib/agent-flows/events.ts — ADMIN_CHANNEL and the PROJECT_SCOPED set
  - lib/agent-flows/stream.ts — subscribeAdminChannel
  - app/api/admin/agent-flow-runs/{route.ts,stream/route.ts}
  - PR #42 (feat/admin-agent-runs)
---

# ADR: One NOTIFY channel for the cross-tenant agent-runs monitor

## Status

Accepted — 2026-08-11, shipped in PR #42.

## Context

`agent_flow_runs` had no admin surface. Execution was visible only per project, inside
one tenant's portal, so there was no way to see what every client's agents were doing
at once — the thing you actually want when agents run unattended.

The existing live plumbing is deliberately two-channel (`lib/agent-flows/events.ts`):
`agent_flow_project_${projectId}` carries run lifecycle only, so a list viewer does not
receive every node event of every concurrent run, while `agent_flow_run_${runId}`
carries everything for the detail view. Both are keyed by an id.

A cross-tenant viewer has no id to key on. It watches *all* projects, including ones
that do not exist yet when the page loads.

Worth recording: the schema anticipated this. `lib/db/schema/agentFlows.ts` comments
`agentFlowRuns.clientId` as "what makes a future portal-wide rollup additive rather
than a migration" — so this shipped with **no schema change**.

## Decision

Add a single constant channel, `agent_flow_admin`, which receives the same coarse
lifecycle events as the project channel. `subscribeAdminChannel()` in
`lib/agent-flows/stream.ts` listens on it; `/api/admin/agent-flow-runs/stream`
subscribes and the page refetches the REST list on each wakeup.

The channel is safe to share across tenants because **the payload is only ever a bare
event id used as a wakeup** — it carries no tenant data. Authorization lives in the SSE
route, which re-queries and decides what to return. This is the same "NOTIFY is a
wakeup, REST is the source of truth" split the portal routes already use, and it is why
one channel for all tenants leaks nothing.

`stream.ts` declares the channel constant locally rather than importing it from
`events.ts`, following that file's existing "keep in sync" convention: `events.ts`
pulls in the Drizzle client, and the listener module must stay a bare LISTEN subscriber.

## Consequences

- An admin viewer wakes on every tenant's run lifecycle, including tenants they are not
  currently looking at. Acceptable — a wakeup is one refetch of a capped list, and the
  monitor wants exactly that breadth.
- A third channel to keep in sync when event types change. Mitigated by both channels
  deriving from the same `PROJECT_SCOPED` set in one place.
- The admin list route is intentionally **unscoped by tenant**, per `app/admin`'s
  global-by-design convention. Nothing in CI would flag an unscoped query here — the
  `boundaries` check is a static import-graph check with no visibility into SQL — so
  this is convention plus review, not an enforced gate.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Subscribe to one channel per project | An admin would have to re-subscribe whenever any tenant creates a project; unbounded and racy. |
| Poll the REST list on an interval | Loses the live feel the per-project view already has, and wastes queries when idle. |
| Put run data in the NOTIFY payload | Would put one tenant's data on a channel every staff viewer listens to; the wakeup-only design avoids the question entirely. |
| Reuse `agentic_os_runs` as the monitor | A separate, dev-only system (`NODE_ENV === 'development'`, 404 in every deploy) that tracks headless `claude -p` runs, not agent flows. |
| Build on pathviz instead | pathviz models *code* — node kinds are screen/component/api/schema, and its claim leases key off file globs. Wrong shape for run monitoring. |
