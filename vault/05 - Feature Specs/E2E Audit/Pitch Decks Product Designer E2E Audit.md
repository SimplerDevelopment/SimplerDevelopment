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

- [ ] Viewer analytics on shared deck (view count, time-on-slide)
- [ ] Access control on shared deck link (password / expiry)
- [ ] Draft/live approval gate for deck publish
- [ ] Deck as first-class block sharing brand + media assets
- [ ] Fork a deck via decks_fork — forked deck is independent, parentDeckId set, original unchanged
- [ ] HTML upload creates a single-slide deck (POST /upload-html with base64 HTML payload)
- [ ] Single-slide publish promotes draft.* to live (POST /slides/[slideIndex]/publish)
- [ ] Batch slide edit applies changes to multiple slides atomically (POST /slides/batch-edit)
- [ ] Deck listing enforces clientId tenancy — client A cannot retrieve client B decks
- [ ] Product designer: POST /designs/[id]/finalize locks design for order placement (returns 200)
- [ ] Product designer: POST /designs/[id]/clone creates independent copy under same session
- [ ] Product designer: POST /designs/[id]/save-as-template marks isTemplate=true and lists in templates
- [ ] Product designer: design-assets CRUD — add icon asset, list by category, delete from library
- [ ] Product designer: design saved with explicit styleId retains styleId on GET
- [ ] Public deck viewer renders published slides at /slides/[slug] without authentication

## Testing


## Blocked


## Passed

- [ ] Pitch decks render for entitled tenant ✓ (redirects to /portal/crm/proposals?tab=decks — Phase 2 MCP pass — screenshot audit-04-pitch-decks.png)
- [ ] Draft/live approval gate and brand-shared blocks ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No viewer analytics on shared deck links — see [[Competitive Gap Analysis 2026-06]]
- [ ] No access control (password/expiry) on shared deck links — see [[Competitive Gap Analysis 2026-06]]
- [ ] No e2e coverage for /designs/[id]/ai-image or /designs/[id]/ai-text endpoints — AI-assisted layer generation untested end-to-end
- [ ] No e2e coverage for /designs/generate-thumbnail endpoint — thumbnail generation path has no automated test
- [ ] No e2e test for claim anonymous design flow (POST /designs/claim) after customer login — cookie-to-customer handoff is untested


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
