---
type: feature-spec
domain: agent-harness
status: In Progress
date: 2026-06-11
sources:
  - app/api/portal/ai/chat/route.ts
  - lib/ai/portal-tools/classifier.ts
  - lib/ai/portal-tools/domains.ts
  - lib/ai/portal-tools/index.ts
  - tests/unit/portal-classifier.test.ts
  - tests/unit/portal-tool-domains.test.ts
---

# Portal Intent Router

The "hub" of the hub-and-spoke topology decided in [[ADR agent-topology-router-not-domain-mesh]]. Narrows the portal chatbot's tool surface per request so the loop sees only the relevant domain(s) instead of all ~80 tools — and is the measurable prerequisite for promoting any domain (e.g. [[Visual-Editor Agent]]) to a real specialist sub-agent.

## Problem

The portal chatbot (`app/api/portal/ai/chat/route.ts`) hands the **entire** `PORTAL_TOOLS` array (~80 tools across 13 domains) to the model on every loop iteration. Two costs:

1. **Tokens** — the full tool schema is re-sent each turn, on a client-facing, credit-metered route.
2. **Tool-selection accuracy** — more tools = more room to pick the wrong one.

## Design

**One Haiku call, two jobs (no extra hop).** The existing complexity classifier already runs pre-loop. It was extended to also return `domains[]`:

- `complexity` → model routing (`simple` → Haiku, `complex` → Sonnet) — unchanged.
- `domains[]` → intent routing — which of the 13 `PORTAL_DOMAINS` the request touches.

**Tool map (`lib/ai/portal-tools/domains.ts`).** `TOOL_DOMAIN` maps every tool name → one router domain (single source of truth). `toolsForDomains(selected, allTools)` returns the union of the selected domains' tools + an always-on baseline (`navigate_to`, `get_dashboard_summary`). Empty `selected` → returns the full set (**fail-open**).

**Drift guard.** `tests/unit/portal-tool-domains.test.ts` asserts exact set-equality between `PORTAL_TOOLS` names and `TOOL_DOMAIN` keys — adding a tool without classifying it fails CI.

**Safety stance (mirrors the complexity classifier).** Any classifier failure → `domains: []` → full tool surface. A router hiccup degrades cost, never capability.

## Rollout — `ROUTER_MODE` flag

| Mode | Loop gets | Purpose |
|---|---|---|
| `'shadow'` (current) | **full** `PORTAL_TOOLS` | Zero capability risk. A `portal.route` span records predicted domains vs. the domains the loop's tool calls *actually* touched → the accuracy signal. |
| `'active'` (next) | only `routedTools` | Real per-call token savings, once shadow data shows the router is reliable. |

The `portal.route` span attributes: `predictedDomains`, `usedDomains`, `routedToolCount` / `totalToolCount`, `misses` (domains used but not predicted — the metric that must trend to ~zero before flipping), `hit`. Response `data.router` carries the same for client-side/eval visibility.

## Status

- [x] Extend classifier → `classifyPortalRequest` returns `domains[]` (back-compat alias kept).
- [x] `domains.ts` map + `toolsForDomains` + `domainsOfToolCalls` + drift guard.
- [x] Wire into chat route in **shadow** mode with `portal.route` measurement span.
- [x] Unit tests (classifier +7, domains 7) — 24 passing.
- [ ] **Collect shadow accuracy data** (miss-rate per domain) from `portal.route` spans / response `data.router`.
- [ ] **Flip `ROUTER_MODE` to `'active'`** once miss-rate is acceptably low; measure token delta.
- [ ] (Stretch) per-domain miss-rate dashboard / eval harness over logged conversations.

## Related

- [[ADR agent-topology-router-not-domain-mesh]] — the deciding ADR (this closes its "Intent router" checklist item).
- [[Building Custom Agents — Principles]] — §7 Cost (cheap classifier routes the request).
- [[Visual-Editor Agent]] — the first specialist this router unblocks.
- [[Company Brain & AI]] — domain map.
