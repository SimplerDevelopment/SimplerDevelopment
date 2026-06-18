---
kanban-plugin: board
type: spec
domain: visual-editor
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] In-canvas AI section generation
- [ ] Scroll / timeline interaction blocks
- [ ] Full approval-iframe client sign-off flow (all 6 entity types)
- [ ] postMessage protocol: selection, resize, save round-trip

## Testing


## Blocked


## Passed

- [ ] Visual editor renders for entitled tenant ✓
- [ ] Approval-page WYSIWYG preview iframe renders live site ✓ (Phase 2 MCP pass — see [[ADR approval-preview-page-scoped-token]])
- [ ] MCP-driven authoring + brand grounding ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No in-canvas AI section generation — see [[Competitive Gap Analysis 2026-06]]
- [ ] No scroll/timeline interaction support — see [[Competitive Gap Analysis 2026-06]]
- [ ] NOTE: Yjs CRDT collab exists (Chat/Realtime domain) — "no co-editing" finding from gap report is refuted
- [ ] NOTE: AB Testing engine exists in lib/ab — "no native A/B" finding from gap report is refuted


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
