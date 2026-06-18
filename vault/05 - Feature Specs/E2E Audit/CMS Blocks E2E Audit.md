---
kanban-plugin: board
type: spec
domain: cms-blocks
status: active
date: 2026-06-17
sources:
  - lib/db/schema/cms.ts
---

## To Test

- [ ] Reference fields between post types
- [ ] Scheduled auto-publish (cron wired to CMS posts)
- [ ] MCP-authored post → approval queue → publish flow
- [ ] Block type registry: all registered types render correctly

## Testing


## Blocked


## Passed

- [ ] CMS post CRUD for entitled tenant ✓
- [ ] Block JSON persistence and retrieval ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No reference fields / relational content linking — see [[Competitive Gap Analysis 2026-06]]
- [ ] Scheduled auto-publish not wired: cron exists, CMS hookup missing — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
