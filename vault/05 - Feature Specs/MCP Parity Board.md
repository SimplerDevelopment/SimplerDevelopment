---
kanban-plugin: board
type: index
domain: mcp
date: 2026-06-23
---

> Initiative board for [[Spec - MCP Parity]]. Tracks the four build-target tool groups that close the API+UI–vs–MCP layers gap identified in `docs/audits/portal-layer-audit-2026-06.md` §5 (tickets_* already existed — audit error; corrected 2026-06-23). Lanes: Backlog → Planned → In Progress → Validating → Shipped.

## Backlog

- [ ] Fix scope catalog: add store:read/store:write to SUPPORTED_SCOPES (used by storefront tools but ungrantable via OAuth) [effort S] — see [[Spec - MCP Parity]]

## Planned

- [ ] surveys_submit_response MCP tool — reuse surveys:write [effort S] — see [[Spec - MCP Parity]]
- [ ] notifications_* MCP tools (list/mark_read) — new notifications:* scope [effort S] — see [[Spec - MCP Parity]]
- [ ] usage_get MCP tool (self-report MCP cost) — reuse billing:read [effort S] — see [[Spec - MCP Parity]]
- [ ] chat_* MCP tools (conversations list/get/reply, widgets) — new chat:* scope [effort M] — see [[Spec - MCP Parity]]
- [ ] analytics_get per-domain MCP tools (email/booking/store/deck) — reuse per-domain read scopes [effort M] — see [[Spec - MCP Parity]]

## In Progress

## Validating

## Shipped

- [x] tickets_* MCP tools ALREADY EXISTED (`lib/mcp/tools/tickets.ts`) — audit error corrected; hardened 2026-06-23 (status-enum waiting→waiting_on_customer bug + slim projections) — see [[Spec - MCP Parity]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
