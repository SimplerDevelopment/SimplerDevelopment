---
kanban-plugin: board
type: spec
domain: agentic-os
status: active
date: 2026-06-17
sources:
  - lib/db/schema/agenticOs.ts
  - tests/e2e/admin-agentic-os.spec.ts
  - lib/mcp/types.ts
---

## To Test

- [ ] MCP-write agent actions across all 6 approval entity types
- [ ] sd_mcp_* scoped token issuance + expiry
- [ ] Agent action audit trail
- [ ] Approval gate blocks unauthorized agent writes
- [ ] Governed agent ops loop: generate → approve → publish
- [ ] GET /api/admin/agentic-os/runs returns paginated run history with correct shape
- [ ] GET /api/admin/agentic-os/runs/[id] returns single run row fields (skillId, status, output, exitCode)
- [ ] POST /api/admin/agentic-os/runs/[id]/cancel returns 200 and flips status to cancelled
- [ ] Non-admin (client) request to /api/admin/agentic-os returns 401 or 404
- [ ] MCP ai_conversations_list tool returns only conversations scoped to the calling client
- [ ] MCP ai_conversations_get tool returns 404 envelope for a foreign conversation id
- [ ] DELETE /api/portal/ai/conversations/[id] removes the conversation and returns 200
- [ ] Credits purchase: POST to buy a credit package succeeds and increments balance

## Testing


## Blocked


## Passed

- [ ] Agentic OS admin panel renders ✓
- [ ] MCP-write surface + approval gate functional ✓
- [ ] Scoped token issuance ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]
- [ ] PATCH /api/portal/ai/conversations/[id] (rename) not yet implemented — sentinel in portal-ai-extras.spec.ts
- [ ] Agentic OS local-dev-only gate (isLocalDev) not exercised at e2e layer — only unit-tested via mock; staging deploy exposure is unverified


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
