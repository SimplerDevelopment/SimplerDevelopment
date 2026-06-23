---
kanban-plugin: board
type: index
domain: mcp
date: 2026-06-23
---

> Initiative board for [[Spec - MCP Parity]]. Tracks the four build-target tool groups that close the API+UI–vs–MCP layers gap identified in `docs/audits/portal-layer-audit-2026-06.md` §5 (tickets_* already existed — audit error; corrected 2026-06-23). Lanes: Backlog → Planned → In Progress → Validating → Shipped.

## Backlog

## Planned

## In Progress

## Validating

## Shipped

- [x] tickets_* MCP tools — already existed; hardened 2026-06-23 (status-enum bug + slim projections) (225eecdb) — see [[Spec - MCP Parity]]
- [x] surveys_submit_response (surveys:write) — submit a response to a tenant-owned active survey (11211559) — see [[Spec - MCP Parity]]
- [x] usage_get (billing:read) — caller's own MCP token/call spend, clientId-scoped (11211559) — see [[Spec - MCP Parity]]
- [x] notifications_list / notifications_mark_read (notifications:*, scoped to userId) (12689e0b) — see [[Spec - MCP Parity]]
- [x] chat_widgets_list / conversations_list / conversations_get / conversation_reply / conversation_update (chat:*) (12689e0b) — see [[Spec - MCP Parity]]
- [x] email/booking/store/deck _analytics_get (per-domain read scopes) (bebd32ef) — see [[Spec - MCP Parity]]
- [x] Scope catalog fix: store:read/store:write added to SUPPORTED_SCOPES (bebd32ef) — see [[Spec - MCP Parity]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
