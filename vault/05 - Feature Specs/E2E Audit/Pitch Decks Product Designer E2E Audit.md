---
kanban-plugin: board
type: spec
domain: pitch-decks-product-designer
status: active
date: 2026-06-17
sources:
  - lib/db/schema/productDesigner.ts
  - tests/e2e/product-designer-ui.spec.ts
  - tests/e2e/product-designer-api.spec.ts
---

## To Test

## Testing


## Blocked


## Passed

- [ ] Pitch decks render for entitled tenant ✓ (redirects to /portal/crm/proposals?tab=decks — Phase 2 MCP pass — screenshot audit-04-pitch-decks.png)
- [ ] Draft/live approval gate and brand-shared blocks ✓
- [ ] ✓ verified 2026-06-20: deck open/render verified; save-button transitions Update→Saved confirmed
- [ ] ✓ verified 2026-06-20 — Public deck viewer renders published slides at /slides/[slug] without authentication (pitch-deck-columns.spec.ts)
- [ ] ✓ verified 2026-06-20 — Deck as first-class block sharing brand + media assets (cov-u14.spec.ts)
- [ ] ✓ verified 2026-06-20 — HTML upload creates a single-slide deck (POST /upload-html with base64 HTML payload) (cov-u15.spec.ts)
- [ ] ✓ verified 2026-06-20 — Single-slide publish promotes draft.* to live (POST /slides/[slideIndex]/publish) (cov-u15.spec.ts)
- [ ] ✓ verified 2026-06-20 — Batch slide edit applies changes to multiple slides atomically (POST /slides/batch-edit) (cov-u15.spec.ts)
- [ ] ✓ verified 2026-06-20 — Deck listing enforces clientId tenancy — client A cannot retrieve client B decks (cov-u16.spec.ts)
- [ ] ✓ verified 2026-06-20 — Product designer: POST /designs/[id]/finalize locks design for order placement (returns 200) (cov-u16.spec.ts)
- [ ] ✓ verified 2026-06-20 — Product designer: POST /designs/[id]/clone creates independent copy under same session (cov-u16.spec.ts)
- [ ] ✓ verified 2026-06-20 — Product designer: POST /designs/[id]/save-as-template marks isTemplate=true and lists in templates (cov-u16.spec.ts)
- [ ] ✓ verified 2026-06-20 — Product designer: design-assets CRUD — add icon asset, list by category, delete from library (cov-u17.spec.ts)
- [ ] ✓ verified 2026-06-20 — Product designer: design saved with explicit styleId retains styleId on GET (cov-u17.spec.ts)
- [x] RESOLVED (partial): ai-image/ai-text auth+validation paths covered — gap-pitch-coverage.spec.ts (generation success needs AI provider)
- [x] RESOLVED (partial): generate-thumbnail validation + https pass-through covered — gap-pitch-coverage.spec.ts (S3 upload success blocked in test)
- [x] RESOLVED: claim-anonymous-design ownership-transfer flow covered — gap-pitch-coverage.spec.ts

## Gaps Found

- [x] RESOLVED 2026-06-22: viewer analytics — pitch_deck_views + public /view tracking + portal /analytics aggregate (c8eba501)
- [ ] No access control (password/expiry) on shared deck links — see [[Competitive Gap Analysis 2026-06]]
- [x] RESOLVED: collabActive was `ydoc!==null` (always true) permanently suppressing the unsaved-changes flag — now keyed to ws-connected — `usePitchDeckState.ts`
- [x] RESOLVED 2026-06-22: Viewer analytics on shared deck (view count, time-on-slide) — c8eba501; gap-deck-analytics-coverage.spec.ts
- [ ] GAP (no implementation): Access control on shared deck link (password / expiry)
- [ ] GAP (no implementation): Draft/live approval gate for deck publish
- [x] RESOLVED 2026-06-22: Fork a deck — portal route POST /tools/pitch-decks/[id]/fork (independent draft, parentDeckId set, original unchanged); gap-deck-fork-coverage.spec.ts — e2ca8508


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
