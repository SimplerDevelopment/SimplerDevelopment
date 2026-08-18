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

- [ ] Governed agent ops loop: generate → approve → publish — needs spec
- [ ] GET /api/admin/agentic-os/runs/[id] returns single run row fields (skillId, status, output, exitCode) — needs spec
- [ ] POST /api/admin/agentic-os/runs/[id]/cancel returns 200 and flips status to cancelled — needs spec

## Testing


## Blocked


## Passed

- [ ] Agentic OS admin panel renders ✓
- [ ] MCP-write surface + approval gate functional ✓
- [ ] Scoped token issuance ✓
- [ ] ✓ verified 2026-06-20: executor-disabled state verified (env parity fix applied)
- [ ] ✓ verified 2026-06-20 — MCP-write agent actions across all 6 approval entity types (portal-mcp-approvals.spec.ts)
- [ ] ✓ verified 2026-06-20 — Approval gate blocks unauthorized agent writes (portal-mcp-approvals.spec.ts)
- [ ] ✓ verified 2026-06-20 — sd_mcp_* scoped token issuance + expiry (cov-u61.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/admin/agentic-os/runs returns paginated run history with correct shape (cov-u61.spec.ts)
- [ ] ✓ verified 2026-06-20 — Non-admin (client) request to /api/admin/agentic-os returns 401 or 404 (cov-u62.spec.ts)
- [ ] ✓ verified 2026-06-20 — MCP ai_conversations_list tool returns only conversations scoped to the calling client (cov-u62.spec.ts)
- [ ] ✓ verified 2026-06-20 — MCP ai_conversations_get tool returns 404 envelope for a foreign conversation id (cov-u63.spec.ts)
- [ ] ✓ verified 2026-06-20 — Credits purchase: POST to buy a credit package succeeds and increments balance (cov-u63.spec.ts)

## Gaps Found

- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]
- [ ] PATCH /api/portal/ai/conversations/[id] (rename) not yet implemented — sentinel in portal-ai-extras.spec.ts
- [ ] Agentic OS local-dev-only gate (isLocalDev) not exercised at e2e layer — only unit-tested via mock; staging deploy exposure is unverified
- [ ] OPEN: run-drawer is load-flaky under Turbopack compile pressure (non-deterministic)
- [ ] GAP (no implementation): Agent action audit trail — needs spec
- [ ] GAP (no implementation): DELETE /api/portal/ai/conversations/[id] removes the conversation and returns 200


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
