---
kanban-plugin: board
type: spec
domain: visual-editor
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] Breakpoint / viewport switching: mobile and tablet modes render iframe at correct width — needs spec

## Testing


## Blocked


## Passed

- [ ] Visual editor renders for entitled tenant ✓
- [ ] Approval-page WYSIWYG preview iframe renders live site ✓ (Phase 2 MCP pass — see [[ADR approval-preview-page-scoped-token]])
- [ ] MCP-driven authoring + brand grounding ✓
- [ ] ✓ verified 2026-06-20 — Revision history API: create post, update twice, fetch /revisions returns ordered list (portal-cms-gap-close.spec.ts)
- [ ] ✓ verified 2026-06-20 — Full approval-iframe client sign-off flow (all 6 entity types) (cov-u45.spec.ts)
- [ ] ✓ verified 2026-06-20 — postMessage protocol: selection, resize, save round-trip (cov-u45.spec.ts)
- [ ] ✓ verified 2026-06-20 — Cross-tenant isolation: client A cannot read or mutate client B's post via editor API (403) (cov-u46.spec.ts)
- [ ] ✓ verified 2026-06-20 — Unauthenticated editor route redirects to portal login (cov-u46.spec.ts)
- [ ] ✓ verified 2026-06-20 — Block picker lists all registered block types for a tenant's site (cov-u46.spec.ts)
- [ ] ✓ verified 2026-06-20 — Context menu: duplicate block action produces identical block appended after selection (cov-u47.spec.ts)
- [ ] ✓ verified 2026-06-20 — BLOCKS_REORDERED postMessage from iframe propagates and persists new order (cov-u47.spec.ts)
- [ ] ✓ verified 2026-06-20 — Page settings (title, SEO meta, slug) saved via editor shell survive reload (cov-u47.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No in-canvas AI section generation — see [[Competitive Gap Analysis 2026-06]]
- [ ] No scroll/timeline interaction support — see [[Competitive Gap Analysis 2026-06]]
- [ ] NOTE: Yjs CRDT collab exists (Chat/Realtime domain) — "no co-editing" finding from gap report is refuted
- [ ] NOTE: AB Testing engine exists in lib/ab — "no native A/B" finding from gap report is refuted
- [ ] GAP (no implementation): In-canvas AI section generation
- [ ] GAP (no implementation): Scroll / timeline interaction blocks


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
