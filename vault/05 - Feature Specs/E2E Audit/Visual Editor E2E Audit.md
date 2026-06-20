---
kanban-plugin: board
type: spec
domain: visual-editor
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] In-canvas AI section generation — needs spec
- [ ] Scroll / timeline interaction blocks — needs spec
- [ ] Full approval-iframe client sign-off flow (all 6 entity types) — needs spec
- [ ] postMessage protocol: selection, resize, save round-trip — needs spec
- [ ] Breakpoint / viewport switching: mobile and tablet modes render iframe at correct width — needs spec
- [ ] Cross-tenant isolation: client A cannot read or mutate client B's post via editor API (403) — needs spec
- [ ] Unauthenticated editor route redirects to portal login — needs spec
- [ ] Block picker lists all registered block types for a tenant's site — needs spec
- [ ] Context menu: duplicate block action produces identical block appended after selection — needs spec
- [ ] BLOCKS_REORDERED postMessage from iframe propagates and persists new order — needs spec
- [ ] Page settings (title, SEO meta, slug) saved via editor shell survive reload — needs spec

## Testing


## Blocked


## Passed

- [ ] Visual editor renders for entitled tenant ✓
- [ ] Approval-page WYSIWYG preview iframe renders live site ✓ (Phase 2 MCP pass — see [[ADR approval-preview-page-scoped-token]])
- [ ] MCP-driven authoring + brand grounding ✓
- [ ] ✓ verified 2026-06-20 — Revision history API: create post, update twice, fetch /revisions returns ordered list (portal-cms-gap-close.spec.ts)

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
