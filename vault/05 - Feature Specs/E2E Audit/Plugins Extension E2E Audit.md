---
kanban-plugin: board
type: spec
domain: plugins-extension
status: active
date: 2026-06-17
sources:
  - lib/db/schema/plugins.ts
  - lib/plugins/entitlement.ts
---

## To Test

- [ ] Plugin install / uninstall lifecycle
- [ ] Plugin entitlement gating
- [ ] Plugin sandboxing (tenant isolation)
- [ ] Extension marketplace browse + install

## Testing


## Blocked


## Passed

- [ ] Plugin schema + entitlement infrastructure ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
