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

## Testing


## Blocked


## Passed

- [ ] Agentic OS admin panel renders ✓
- [ ] MCP-write surface + approval gate functional ✓
- [ ] Scoped token issuance ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
